// Live SGT scorecard poller for League Highlights.
// Runs every 2 minutes via pg_cron. For each recording_sessions row with
// status='recording', fetches the player's scorecard directly from the SGT
// club-admin endpoint (same one sgt-sync uses, so we know the URL shape is
// correct). Any hole that newly appears in the scorecard gets a
// recording_holes row stamped with hole_completed_at = now() — this is our
// per-hole reference timestamp for chapter markers in the raw clip.
//
// Timestamps are approximate (accurate to the 2-minute poll cadence) which
// is fine: the raw MKV is kept intact and chapters are overlays, not cuts.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = Deno.env.get("SGT_CLUB_URL") ?? "birdiesbayside";

async function fetchTournamentScorecards(tournamentId: string, apiKey: string) {
  const url = `${SGT_BASE_URL}/${CLUB_URL}/tournaments/scorecards?api-key=${encodeURIComponent(apiKey)}&tournamentId=${encodeURIComponent(tournamentId)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[poller] SGT ${res.status} for tournament ${tournamentId}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.error("[poller] SGT fetch failed:", (e as Error).message);
    return null;
  }
}

/** Extract per-hole {number, par, score} from an SGT scorecard row. */
function holesFromScorecard(sc: Record<string, unknown>) {
  const out: Array<{ hole_number: number; par: number | null; score: number | null }> = [];
  for (let n = 1; n <= 18; n++) {
    // sgt-sync stores keys as h1_gross / hole1_gross depending on API version.
    const scoreVal = sc[`hole${n}_gross`] ?? sc[`h${n}_gross`] ?? sc[`hole${n}`] ?? sc[`h${n}`];
    const parVal = sc[`hole${n}_par`] ?? sc[`h${n}_par`] ?? sc[`par${n}`];
    const score = scoreVal != null && scoreVal !== "" && Number(scoreVal) > 0 ? Number(scoreVal) : null;
    const par = parVal != null && parVal !== "" ? Number(parVal) : null;
    out.push({ hole_number: n, par, score });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Get active SGT API key (same lookup pattern as sgt-api)
  const { data: apiConfig } = await supabase
    .from("sgt_api_config")
    .select("api_key")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!apiConfig?.api_key) {
    return new Response(JSON.stringify({ error: "no SGT api key configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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

  // Cache scorecard responses per-tournament so multiple bays on the same
  // tournament only trigger one fetch.
  const scorecardCache = new Map<string, unknown>();

  for (const sess of sessions ?? []) {
    if (!sess.sgt_user_id || !sess.sgt_tournament_id) continue;

    let card = scorecardCache.get(String(sess.sgt_tournament_id));
    if (card === undefined) {
      card = await fetchTournamentScorecards(String(sess.sgt_tournament_id), apiConfig.api_key);
      scorecardCache.set(String(sess.sgt_tournament_id), card);
    }
    if (!card) {
      results.push({ session: sess.id, skipped: "no scorecard" });
      continue;
    }

    // Find this player's scorecard in the tournament response.
    const arr: Record<string, unknown>[] =
      (card as any)?.scorecards ??
      (card as any)?.results ??
      (Array.isArray(card) ? (card as any) : []);
    const mine = arr.find((r) => String(r.playerId ?? r.player_id ?? "") === String(sess.sgt_user_id));
    if (!mine) {
      results.push({ session: sess.id, skipped: "player not in tournament" });
      continue;
    }
    const holes = holesFromScorecard(mine);

    const { data: known } = await supabase
      .from("recording_holes")
      .select("hole_number, hole_completed_at, pre_existing")
      .eq("recording_session_id", sess.id);
    const knownMap = new Map(
      (known ?? []).map((k) => [k.hole_number, { completed: !!k.hole_completed_at, preExisting: !!k.pre_existing }]),
    );

    // First-run for this session: mark holes ALREADY scored at recording
    // start as pre_existing (played in an earlier session, not ours to clip).
    const isFirstPoll = (known ?? []).length === 0;

    let newlyCompleted = 0;
    const nowIso = new Date().toISOString();

    for (const h of holes) {
      if (h.score == null) continue;
      const existing = knownMap.get(h.hole_number);
      if (existing?.preExisting) continue;
      if (existing?.completed) continue;

      const preExisting = isFirstPoll; // already there when we started recording

      const { error: upErr } = await supabase.from("recording_holes").upsert(
        {
          recording_session_id: sess.id,
          hole_number: h.hole_number,
          par: h.par,
          score: h.score,
          hole_completed_at: preExisting ? null : nowIso,
          pre_existing: preExisting,
          status: "pending",
          updated_at: nowIso,
        },
        { onConflict: "recording_session_id,hole_number" },
      );
      if (upErr) {
        console.error(`[poller] upsert hole ${h.hole_number} for ${sess.id} failed:`, upErr.message);
        continue;
      }
      if (!preExisting) newlyCompleted++;
    }

    results.push({ session: sess.id, bay: sess.bay_number, first_poll: isFirstPoll, newly_completed: newlyCompleted });
  }

  // Auto-run the tagger so highlights land in the queue without a separate cron round-trip.
  try {
    await supabase.functions.invoke("sgt-highlight-tagger", { body: {} });
  } catch (e) {
    console.error("[poller] tagger invoke failed:", (e as Error).message);
  }

  return new Response(JSON.stringify({ ok: true, sessions_polled: sessions?.length ?? 0, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
