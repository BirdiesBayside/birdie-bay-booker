// Live SGT scorecard poller for League Highlights.
// Runs every minute via pg_cron during active tournament windows.
//
// For every recording_sessions row with status='recording':
//   1. Fetch the player's live scorecard from SGT.
//   2. Diff against recording_holes we already know about.
//   3. For each newly-completed hole:
//        - Insert/update recording_holes with par, score, hole_completed_at (server now()).
//        - Insert a pending bay_commands row (command='obs_chapter:<hole>') so the
//          Bay Controller can inject an OBS chapter marker in real time.
//
// Clip windows are derived server-side from hole_completed_at timestamps
// (see hole-splitter logic on the bay), not from per-shot CSVs — the SGT
// API does not expose individual shots for course play.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE = Deno.env.get("SGT_CLUB_URL") ?? "";
const SGT_API_KEY = Deno.env.get("SGT_API_KEY") ?? "";

interface LiveScorecardHole {
  hole?: number;
  par?: number;
  score?: number | string | null;
}

async function fetchLiveScorecard(playerId: string, tournamentId: string) {
  if (!SGT_BASE || !SGT_API_KEY) return null;
  const url = `${SGT_BASE.replace(/\/$/, "")}/api/live-scorecard.php?apikey=${encodeURIComponent(SGT_API_KEY)}&playerId=${encodeURIComponent(playerId)}&tournamentId=${encodeURIComponent(tournamentId)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error("[poller] SGT fetch failed:", (e as Error).message);
    return null;
  }
}

/** Extract per-hole {number, par, score} from whatever shape SGT returns. */
function extractHoles(scorecard: unknown): Array<{ hole_number: number; par: number | null; score: number | null }> {
  if (!scorecard || typeof scorecard !== "object") return [];
  const sc = scorecard as Record<string, unknown>;

  // Common shape 1: { holes: [{hole, par, score}, ...] }
  if (Array.isArray(sc.holes)) {
    return (sc.holes as LiveScorecardHole[])
      .map((h) => ({
        hole_number: Number(h.hole ?? 0),
        par: h.par != null ? Number(h.par) : null,
        score: h.score != null && h.score !== "" ? Number(h.score) : null,
      }))
      .filter((h) => h.hole_number >= 1 && h.hole_number <= 18);
  }

  // Common shape 2: holeData: { "1": 4, "2": 5, ... } + parData similar
  const holeData = sc.holeData as Record<string, unknown> | undefined;
  const parData = sc.parData as Record<string, unknown> | undefined;
  if (holeData && typeof holeData === "object") {
    const out: Array<{ hole_number: number; par: number | null; score: number | null }> = [];
    for (let n = 1; n <= 18; n++) {
      const s = holeData[String(n)];
      const p = parData?.[String(n)];
      const score = s != null && s !== "" && s !== 0 ? Number(s) : null;
      out.push({ hole_number: n, par: p != null ? Number(p) : null, score });
    }
    return out;
  }

  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // All currently-recording sessions
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

  const results: Array<Record<string, unknown>> = [];

  for (const sess of sessions ?? []) {
    if (!sess.sgt_user_id || !sess.sgt_tournament_id) continue;

    const card = await fetchLiveScorecard(String(sess.sgt_user_id), String(sess.sgt_tournament_id));
    const holes = extractHoles(card);
    if (holes.length === 0) {
      results.push({ session: sess.id, skipped: "no scorecard" });
      continue;
    }

    // What holes have we already logged for this session?
    const { data: known } = await supabase
      .from("recording_holes")
      .select("hole_number, hole_completed_at, score")
      .eq("recording_session_id", sess.id);
    const knownMap = new Map<number, { completed: boolean; score: number | null }>(
      (known ?? []).map((k) => [k.hole_number, { completed: !!k.hole_completed_at, score: k.score }]),
    );

    let newlyCompleted = 0;

    for (const h of holes) {
      if (h.score == null) continue; // hole not finished yet
      const existing = knownMap.get(h.hole_number);
      if (existing?.completed) continue; // already tracked

      const nowIso = new Date().toISOString();

      // Upsert the hole record with completion timestamp
      const { error: upErr } = await supabase.from("recording_holes").upsert(
        {
          recording_session_id: sess.id,
          hole_number: h.hole_number,
          par: h.par,
          score: h.score,
          hole_completed_at: nowIso,
          status: "pending",
          updated_at: nowIso,
        },
        { onConflict: "recording_session_id,hole_number" },
      );
      if (upErr) {
        console.error(`[poller] upsert hole ${h.hole_number} for ${sess.id} failed:`, upErr.message);
        continue;
      }
      newlyCompleted++;

      // Dispatch OBS chapter marker command to the bay controller
      await supabase.from("bay_commands").insert({
        bay_number: sess.bay_number,
        command: `obs_chapter:hole=${h.hole_number}`,
        status: "pending",
      });
    }

    results.push({ session: sess.id, bay: sess.bay_number, holes_seen: holes.length, newly_completed: newlyCompleted });
  }

  return new Response(JSON.stringify({ ok: true, sessions_polled: sessions?.length ?? 0, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
