// Live SGT hole tracker for League Highlights (embed-scrape version).
//
// Instead of hammering the club-admin scorecards API per player, we fetch
// ONE public embed page per active tournament and parse the "(N)" indicator
// next to each player's round score to know which hole they're currently on.
// Format observed at https://simulatorgolftour.com/embed/tournament/<id>/standings/gross:
//   <td class='... round ...'>+2 <span ...>F</span></td>       ← round complete
//   <td class='... round ...'>+6 <span ...>(4)</span></td>     ← currently on hole 4 (thru 3)
//   <td class='... round ...'>  <span ...></span></td>         ← not started
//
// When a player's "current hole" advances (e.g. 4 → 5), we stamp
// hole_completed_at = now() on the hole they just finished (N-1) for the
// matching recording_sessions row. Score/par data still comes from the
// morning sgt-sync, which the tagger consumes afterward.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchEmbedHtml(tournamentId: string): Promise<string | null> {
  const url = `https://simulatorgolftour.com/embed/tournament/${encodeURIComponent(tournamentId)}/standings/gross`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "BirdiesHub-HighlightPoller/1.0" } });
    if (!res.ok) {
      console.error(`[poller] embed ${res.status} for tournament ${tournamentId}`);
      return null;
    }
    return await res.text();
  } catch (e) {
    console.error("[poller] embed fetch failed:", (e as Error).message);
    return null;
  }
}

/**
 * Parse the embed HTML into a map of { playerName (lowercased) -> currentHole | "F" | null }.
 * currentHole is the hole number they are CURRENTLY on (i.e. they have completed hole N-1).
 * "F" means the round is complete (all 18 done).
 * null means not started / no round cell filled.
 *
 * The embed can render multiple round columns (RD 1, RD 2). We take the LAST
 * non-empty round cell per player as the "active" round.
 */
function parseEmbed(html: string): Map<string, { hole: number | null; finished: boolean }> {
  const out = new Map<string, { hole: number | null; finished: boolean }>();
  // Split into player rows.
  const rowRegex = /<tr\s+data-player-name='([^']+)'>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(html)) !== null) {
    const playerName = m[1].trim().toLowerCase();
    const rowHtml = m[2];
    // Collect all round cells (class contains "round").
    const cellRegex = /<td[^>]*class='[^']*\bround\b[^']*'[^>]*>([\s\S]*?)<\/td>/g;
    let c: RegExpExecArray | null;
    let latest: { hole: number | null; finished: boolean } | null = null;
    while ((c = cellRegex.exec(rowHtml)) !== null) {
      const cellText = c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!cellText) continue;
      if (/\bF\b/.test(cellText)) {
        latest = { hole: null, finished: true };
      } else {
        const paren = cellText.match(/\((\d+)\)/);
        if (paren) {
          latest = { hole: Number(paren[1]), finished: false };
        } else {
          // score-only cell (e.g. mid-round before SGT adds the "(N)" indicator) — ignore.
        }
      }
    }
    if (latest) out.set(playerName, latest);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: sessions, error: sessErr } = await supabase
    .from("recording_sessions")
    .select("id, bay_number, sgt_user_id, sgt_tournament_id, started_at")
    .eq("status", "recording");

  if (sessErr) {
    return new Response(JSON.stringify({ error: sessErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // sgt_user_id is stored as TEXT on recording_sessions but INTEGER on sgt_members.
  // Coerce to number consistently to avoid Map key type mismatches.
  const activeSessions = (sessions ?? [])
    .filter((s) => s.sgt_user_id && s.sgt_tournament_id)
    .map((s) => ({ ...s, sgt_user_id_num: Number(s.sgt_user_id) }))
    .filter((s) => Number.isFinite(s.sgt_user_id_num));

  // Map sgt_user_id -> SGT username for all active players.
  const userIds = Array.from(new Set(activeSessions.map((s) => s.sgt_user_id_num)));
  const nameByUserId = new Map<number, string>();
  if (userIds.length > 0) {
    const { data: members } = await supabase
      .from("sgt_members")
      .select("user_id, user_name")
      .in("user_id", userIds);
    for (const m of members ?? []) {
      if (m.user_name) nameByUserId.set(Number(m.user_id), String(m.user_name).trim().toLowerCase());
    }
  }

  // Cache embed HTML per tournament so multiple bays on same tournament = 1 fetch.
  const embedCache = new Map<string, Map<string, { hole: number | null; finished: boolean }>>();
  const results: Array<Record<string, unknown>> = [];
  const nowIso = new Date().toISOString();

  for (const sess of activeSessions) {
    const tournId = String(sess.sgt_tournament_id);
    let players = embedCache.get(tournId);
    if (!players) {
      const html = await fetchEmbedHtml(tournId);
      if (!html) {
        results.push({ session: sess.id, skipped: "embed fetch failed" });
        continue;
      }
      players = parseEmbed(html);
      embedCache.set(tournId, players);
    }

    const sgtName = nameByUserId.get(sess.sgt_user_id_num);
    if (!sgtName) {
      results.push({ session: sess.id, skipped: "no sgt username mapping" });
      continue;
    }
    const state = players.get(sgtName);
    if (!state) {
      results.push({ session: sess.id, skipped: "player not on embed", sgt_name: sgtName });
      continue;
    }

    // Existing holes for this session.
    const { data: known } = await supabase
      .from("recording_holes")
      .select("hole_number, hole_completed_at, pre_existing")
      .eq("recording_session_id", sess.id);
    const knownMap = new Map((known ?? []).map((k) => [k.hole_number, k]));
    const isFirstPoll = (known ?? []).length === 0;

    // Determine which holes are considered COMPLETED right now.
    // If finished=F: all 18 done. If hole=N: holes 1..(N-1) done.
    let completedThrough = 0;
    if (state.finished) completedThrough = 18;
    else if (state.hole && state.hole > 1) completedThrough = state.hole - 1;

    // First poll: any already-completed holes are pre-existing (played before we hit record).
    // Subsequent polls: newly-completed holes get hole_completed_at = now().
    let newlyCompleted = 0;
    let markedPreExisting = 0;

    for (let n = 1; n <= completedThrough; n++) {
      const existing = knownMap.get(n);
      if (existing?.hole_completed_at || existing?.pre_existing) continue;

      const preExisting = isFirstPoll;
      const { error: upErr } = await supabase.from("recording_holes").upsert(
        {
          recording_session_id: sess.id,
          hole_number: n,
          par: null,
          score: null,
          hole_completed_at: preExisting ? null : nowIso,
          pre_existing: preExisting,
          status: "pending",
          updated_at: nowIso,
        },
        { onConflict: "recording_session_id,hole_number" },
      );
      if (upErr) {
        console.error(`[poller] upsert hole ${n} for ${sess.id} failed:`, upErr.message);
        continue;
      }
      if (preExisting) markedPreExisting++;
      else newlyCompleted++;
    }

    results.push({
      session: sess.id,
      bay: sess.bay_number,
      sgt_name: sgtName,
      current_hole: state.hole,
      finished: state.finished,
      first_poll: isFirstPoll,
      newly_completed: newlyCompleted,
      marked_pre_existing: markedPreExisting,
    });
  }

  // Tagger fills in par/score from the DB (populated by morning sgt-sync).
  try {
    await supabase.functions.invoke("sgt-highlight-tagger", { body: {} });
  } catch (e) {
    console.error("[poller] tagger invoke failed:", (e as Error).message);
  }

  return new Response(
    JSON.stringify({ ok: true, sessions_polled: activeSessions.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
