// Round-only Highlight Orchestrator.
//
// Polls every ~60s (via cron). For each ACTIVE booking, decides whether to
// start / stop OBS recording based on the player's live scoring state:
//
//   SGT booking:
//     - Poll the tournament embed page for the player's current hole.
//     - When they appear on hole >= 1 (and round is not already finished),
//       insert a recording_sessions row (status='recording') and issue an
//       `obs_start_recording:session_id=<uuid>` command.
//     - When they show "F" (finished) OR the booking ends OR 20+ min of no
//       activity, mark session status='stopping', issue
//       `obs_stop_recording:session_id=<uuid>`, and — on a natural finish —
//       fetch the full scorecard from the SGT API once and cache it on the
//       recording_sessions row for hole-by-hole display in the Hub.
//     - Keeps polling for additional rounds within the same booking
//       (round_number auto-increments).
//
//   Local Comp booking (booking notes contain "[COMP]" + comp exists today):
//     - Start recording on first poll after booking becomes active.
//     - Stop when the team's `net_score` flips from NULL to a value (scores
//       have been posted) or the booking ends.
//
// No booking? No polling, no recording, no disk usage.
//
// NOTE: We no longer stamp per-hole timeline rows or invoke the highlights
// tagger. The final scorecard is fetched once at F and rendered as a mini
// scorecard in the highlights UI — staff scrub the video manually.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ABANDONED_MINUTES = 20;
const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const SGT_CLUB = "birdiesbayside";

// ---------- SGT embed helpers ----------
async function fetchEmbedHtml(tournamentId: string): Promise<string | null> {
  const url = `https://simulatorgolftour.com/embed/tournament/${encodeURIComponent(tournamentId)}/standings/gross`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "BirdiesHub-HighlightPoller/2.0" } });
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

// Parse each player row's RD 1 / RD 2 / ... cells (in order). The player's
// current round = 1-based index of the LAST non-empty round cell. `finished`
// is true when that cell shows F. `hole` is the current hole if in progress.
function parseEmbed(html: string): Map<string, { hole: number | null; finished: boolean; round: number }> {
  const out = new Map<string, { hole: number | null; finished: boolean; round: number }>();
  const rowRegex = /<tr\s+data-player-name='([^']+)'>([\s\S]*?)<\/tr>/g;
  let m: RegExpExecArray | null;
  while ((m = rowRegex.exec(html)) !== null) {
    const playerName = m[1].trim().toLowerCase();
    const rowHtml = m[2];
    const cellRegex = /<td[^>]*class='[^']*\bround\b[^']*'[^>]*>([\s\S]*?)<\/td>/g;
    let c: RegExpExecArray | null;
    let idx = 0;
    let latest: { hole: number | null; finished: boolean; round: number } | null = null;
    while ((c = cellRegex.exec(rowHtml)) !== null) {
      idx += 1;
      const cellText = c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!cellText) continue;
      if (/\bF\b/.test(cellText)) latest = { hole: null, finished: true, round: idx };
      else {
        const paren = cellText.match(/\((\d+)\)/);
        if (paren) latest = { hole: Number(paren[1]), finished: false, round: idx };
      }
    }
    if (latest) out.set(playerName, latest);
  }
  return out;
}

// Brisbane today (AEST/UTC+10, no DST)
function brisbaneToday(): string {
  const now = new Date();
  const bris = new Date(now.getTime() + 10 * 3600_000);
  return bris.toISOString().slice(0, 10);
}
function brisbaneNowTime(): string {
  const now = new Date();
  const bris = new Date(now.getTime() + 10 * 3600_000);
  return bris.toISOString().slice(11, 19);
}

// ---------- SGT API helpers (single-use, only fires on natural F) ----------
async function getSgtApiKey(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const { data } = await supabase
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cfg = data as { api_key: string; expires_at: string } | null;
  if (!cfg?.api_key) return null;
  if (new Date(cfg.expires_at).getTime() <= Date.now()) return null;
  return cfg.api_key;
}

async function fetchAllScorecardsForPlayer(
  apiKey: string,
  tournamentId: string,
  playerId: number,
): Promise<Record<string, unknown>[]> {
  const url = new URL(`${SGT_BASE_URL}/${SGT_CLUB}/tournaments/scorecards`);
  url.searchParams.append("api-key", apiKey);
  url.searchParams.append("tournamentId", tournamentId);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error(`[poller] scorecards fetch ${res.status}`);
      return [];
    }
    const payload = await res.json();
    if (payload === "INVALID API KEY") return [];
    const list: Record<string, unknown>[] = Array.isArray(payload)
      ? payload
      : (payload?.scorecards ?? payload?.results ?? []);
    return list.filter((sc) => Number(sc.playerId) === Number(playerId));
  } catch (e) {
    console.error("[poller] scorecard fetch failed:", (e as Error).message);
    return [];
  }
}

async function fetchScorecardForPlayer(
  apiKey: string,
  tournamentId: string,
  playerId: number,
  roundNumber: number,
): Promise<Record<string, unknown> | null> {
  const all = await fetchAllScorecardsForPlayer(apiKey, tournamentId, playerId);
  return all.find((sc) => Number(sc.round ?? 1) === Number(roundNumber)) ?? null;
}


function shapeScorecard(sc: Record<string, unknown>) {
  const holeData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(sc)) {
    if (/^h\d+/.test(k) || /^hole\d+/.test(k)) holeData[k] = v;
  }
  return {
    player_name: sc.player_name ?? null,
    hcp_index: sc.hcp_index ?? null,
    round: sc.round ?? null,
    course_name: sc.courseName ?? null,
    teetype: sc.teetype ?? null,
    total_gross: sc.total_gross ?? null,
    total_net: sc.total_net ?? null,
    to_par_gross: sc.toPar_gross ?? null,
    to_par_net: sc.toPar_net ?? null,
    in_gross: sc.in_gross ?? null,
    out_gross: sc.out_gross ?? null,
    in_net: sc.in_net ?? null,
    out_net: sc.out_net ?? null,
    hole_data: holeData,
    fetched_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const nowIso = new Date().toISOString();
  const today = brisbaneToday();
  const nowTime = brisbaneNowTime();

  // 1. Load orchestration config (global toggle)
  const { data: cfg } = await supabase
    .from("system_settings")
    .select("highlight_recording_enabled")
    .eq("id", "global")
    .maybeSingle();
  if (!cfg?.highlight_recording_enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: "recording disabled" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Active bookings (Brisbane today, currently in window, confirmed)
  const { data: bookings } = await supabase
    .from("bookings")
    .select("id, user_id, bay_id, booking_date, start_time, end_time, notes, status")
    .eq("booking_date", today)
    .eq("status", "confirmed")
    .lte("start_time", nowTime)
    .gte("end_time", nowTime);

  const activeBookings = bookings ?? [];
  if (activeBookings.length === 0) {
    return new Response(JSON.stringify({ ok: true, active_bookings: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Resolve bay numbers
  const bayIds = Array.from(new Set(activeBookings.map((b) => b.bay_id).filter(Boolean)));
  const { data: bays } = await supabase.from("bays").select("id, bay_number").in("id", bayIds);
  const bayNumberById = new Map((bays ?? []).map((b) => [b.id, b.bay_number]));

  // 4. Profiles for each booking
  const userIds = Array.from(new Set(activeBookings.map((b) => b.user_id)));
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, first_name, last_name, sgt_user_id")
    .in("user_id", userIds);
  const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  // 5. Any recording_sessions currently active for these bookings
  const bookingIds = activeBookings.map((b) => b.id);
  const { data: activeSessions } = await supabase
    .from("recording_sessions")
    .select("id, booking_id, bay_number, sgt_user_id, sgt_tournament_id, started_at, status, round_number, trigger_source, last_progress_at")
    .in("booking_id", bookingIds)
    .in("status", ["recording", "stopping"]);
  const sessionByBookingId = new Map((activeSessions ?? []).map((s) => [s.booking_id, s]));

  // 6. Existing session counts (to compute next round_number)
  const { data: allSessionsForBookings } = await supabase
    .from("recording_sessions")
    .select("booking_id")
    .in("booking_id", bookingIds);
  const sessionCountByBooking = new Map<string, number>();
  for (const s of allSessionsForBookings ?? []) {
    sessionCountByBooking.set(s.booking_id, (sessionCountByBooking.get(s.booking_id) ?? 0) + 1);
  }

  // 7. Load today's active tournament (single) + SGT member name lookup
  const { data: tournaments } = await supabase
    .from("sgt_tournaments")
    .select("tournament_id, name, start_date, end_date")
    .lte("start_date", today)
    .gte("end_date", today)
    .order("start_date", { ascending: false })
    .limit(1);
  const activeTourney = tournaments?.[0] ?? null;

  const sgtUserIds = Array.from(
    new Set(
      activeBookings
        .map((b) => Number(profileByUserId.get(b.user_id)?.sgt_user_id ?? NaN))
        .filter((n) => Number.isFinite(n)),
    ),
  );
  const nameByUserId = new Map<number, string>();
  if (sgtUserIds.length > 0) {
    const { data: members } = await supabase
      .from("sgt_members")
      .select("user_id, user_name")
      .in("user_id", sgtUserIds);
    for (const m of members ?? []) {
      if (m.user_name) nameByUserId.set(Number(m.user_id), String(m.user_name).trim().toLowerCase());
    }
  }

  // 8. Load today's local competition (single) if any [COMP] booking present
  const hasCompBooking = activeBookings.some((b) => (b.notes ?? "").includes("[COMP]"));
  const { data: compRows } = hasCompBooking
    ? await supabase
        .from("local_competitions")
        .select("id, name, date, status")
        .eq("date", today)
        .in("status", ["upcoming", "active"])
        .limit(1)
    : { data: [] as any[] };
  const activeComp = compRows?.[0] ?? null;

  const { data: compTeams } = activeComp
    ? await supabase
        .from("local_comp_teams")
        .select("id, player1_name, player2_name, net_score, position")
        .eq("competition_id", activeComp.id)
    : { data: [] as any[] };

  const { data: compSettingsRow } = hasCompBooking
    ? await supabase.from("local_comp_settings").select("hub_highlights_enabled").limit(1).maybeSingle()
    : { data: null };
  const compEnabled = !!compSettingsRow?.hub_highlights_enabled;

  // Cache tournament embeds so multiple bays on same tourney = 1 fetch.
  const embedCache = new Map<string, Map<string, { hole: number | null; finished: boolean }>>();

  const results: Array<Record<string, unknown>> = [];

  // ---------- HELPERS ----------
  async function issueStart(session: {
    booking_id: string;
    bay_number: number;
    trigger_source: string;
    sgt_user_id?: string | null;
    sgt_tournament_id?: string | null;
    player_name?: string | null;
    tournament_name?: string | null;
    round_number: number;
  }) {
    const { data: settingsRow } = await supabase
      .from("system_settings")
      .select("highlight_retention_days")
      .eq("id", "global")
      .maybeSingle();
    const retentionDays = settingsRow?.highlight_retention_days ?? 14;
    const retentionUntil = new Date(Date.now() + retentionDays * 86400_000).toISOString();

    const { data: inserted, error: insErr } = await supabase
      .from("recording_sessions")
      .insert({
        booking_id: session.booking_id,
        bay_number: session.bay_number,
        sgt_user_id: session.sgt_user_id ?? null,
        sgt_tournament_id: session.sgt_tournament_id ?? null,
        player_name: session.player_name ?? null,
        tournament_name: session.tournament_name ?? null,
        started_at: nowIso,
        status: "recording",
        round_number: session.round_number,
        trigger_source: session.trigger_source,
        last_progress_at: nowIso,
        retention_until: retentionUntil,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      // 23505 = a concurrent poller invocation already opened this round's session.
      // The unique index recording_sessions_active_unique guarantees only one wins.
      if ((insErr as any)?.code === "23505") {
        console.log(
          `[poller] duplicate start suppressed booking=${session.booking_id} round=${session.round_number} (session already active)`,
        );
      } else {
        console.error("[poller] start insert failed:", insErr?.message);
      }
      return null;
    }


    const { error: cmdErr } = await supabase.from("bay_commands").insert({
      bay_number: session.bay_number,
      command: `obs_start_recording:session_id=${inserted.id}`,
      status: "pending",
    });
    if (cmdErr) console.error("[poller] start command insert failed:", cmdErr.message);
    return inserted.id;
  }

  async function issueStop(sessionId: string, bayNumber: number, partial: boolean, reason: string) {
    await supabase
      .from("recording_sessions")
      .update({ status: "stopping", partial, updated_at: nowIso })
      .eq("id", sessionId);
    const { error: cmdErr } = await supabase.from("bay_commands").insert({
      bay_number: bayNumber,
      command: `obs_stop_recording:session_id=${sessionId}`,
      status: "pending",
    });
    if (cmdErr) console.error("[poller] stop command insert failed:", cmdErr.message);
    console.log(`[poller] STOP session=${sessionId} bay=${bayNumber} partial=${partial} reason=${reason}`);
  }

  // Fetch and cache the final scorecard once a round finishes naturally.
  async function captureScorecard(session: {
    id: string;
    sgt_tournament_id: string | null;
    sgt_user_id: string | null;
    round_number: number;
  }) {
    if (!session.sgt_tournament_id || !session.sgt_user_id) return;
    const playerId = Number(session.sgt_user_id);
    if (!Number.isFinite(playerId)) return;
    const apiKey = await getSgtApiKey(supabase);
    if (!apiKey) {
      console.warn(`[poller] scorecard capture skipped for session ${session.id}: no valid SGT API key`);
      return;
    }
    const raw = await fetchScorecardForPlayer(apiKey, session.sgt_tournament_id, playerId, session.round_number);
    if (!raw) {
      console.warn(`[poller] scorecard capture: no matching row for session ${session.id} (player=${playerId} round=${session.round_number})`);
      return;
    }
    await supabase
      .from("recording_sessions")
      .update({ scorecard: shapeScorecard(raw), updated_at: nowIso })
      .eq("id", session.id);
    console.log(`[poller] scorecard cached for session ${session.id}`);
  }

  // ---------- MAIN LOOP ----------
  for (const booking of activeBookings) {
    const bayNumber = bayNumberById.get(booking.bay_id);
    if (!bayNumber) continue;

    const prof = profileByUserId.get(booking.user_id);
    const playerName = [prof?.first_name, prof?.last_name].filter(Boolean).join(" ").trim() || "Player";
    const session = sessionByBookingId.get(booking.id);

    // ----- BOOKING END GUARD -----
    const bookingEndMs = new Date(`${booking.booking_date}T${booking.end_time}`).getTime();
    if (session && Date.now() >= bookingEndMs - 5000) {
      await issueStop(session.id, bayNumber, true, "booking_end");
      results.push({ booking: booking.id, action: "stop_booking_end" });
      continue;
    }

    // ----- SGT branch -----
    const sgtUserIdRaw = prof?.sgt_user_id;
    const sgtUserIdNum = sgtUserIdRaw ? Number(sgtUserIdRaw) : NaN;
    if (activeTourney && Number.isFinite(sgtUserIdNum)) {
      const tournId = String(activeTourney.tournament_id);
      let players = embedCache.get(tournId);
      if (!players) {
        const html = await fetchEmbedHtml(tournId);
        if (html) {
          players = parseEmbed(html);
          embedCache.set(tournId, players);
        }
      }
      const sgtName = nameByUserId.get(sgtUserIdNum);
      const state = sgtName && players ? players.get(sgtName) : undefined;

      if (session) {
        if (state?.finished) {
          await issueStop(session.id, bayNumber, false, "round_finished");
          await captureScorecard({
            id: session.id,
            sgt_tournament_id: session.sgt_tournament_id ?? tournId,
            sgt_user_id: session.sgt_user_id ?? String(sgtUserIdNum),
            round_number: session.round_number ?? 1,
          });
          results.push({ booking: booking.id, action: "stop_finished" });
        } else if (state?.hole && state.hole >= 1) {
          // Round in progress — just refresh the progress heartbeat.
          await supabase
            .from("recording_sessions")
            .update({ last_progress_at: nowIso })
            .eq("id", session.id);
          results.push({ booking: booking.id, action: "progress", hole: state.hole });
        } else {
          const lastProgress = session.last_progress_at ? new Date(session.last_progress_at).getTime() : Date.now();
          if (Date.now() - lastProgress > ABANDONED_MINUTES * 60_000) {
            await issueStop(session.id, bayNumber, true, "no_progress");
            results.push({ booking: booking.id, action: "stop_no_progress" });
          } else {
            results.push({ booking: booking.id, action: "waiting" });
          }
        }
      } else {
        if (state && !state.finished && state.hole && state.hole >= 1) {
          // Round number comes straight from the embed column (RD 1 / RD 2 / ...).
          const roundNumber = state.round;
          const newId = await issueStart({
            booking_id: booking.id,
            bay_number: bayNumber,
            trigger_source: "sgt",
            sgt_user_id: String(sgtUserIdNum),
            sgt_tournament_id: tournId,
            player_name: playerName,
            tournament_name: activeTourney.name,
            round_number: roundNumber,
          });
          if (newId) {
            sessionCountByBooking.set(booking.id, roundNumber);
            results.push({ booking: booking.id, action: "start_round", round: roundNumber, hole: state.hole });
          }
        } else {
          results.push({ booking: booking.id, action: "sgt_idle", state });
        }
      }
      continue;
    }

    // ----- Local Comp branch -----
    if ((booking.notes ?? "").includes("[COMP]") && activeComp && compEnabled) {
      const first = (prof?.first_name ?? "").toLowerCase().trim();
      const last = (prof?.last_name ?? "").toLowerCase().trim();
      const full = `${first} ${last}`.trim();
      const team = (compTeams ?? []).find((t) => {
        const p1 = (t.player1_name ?? "").toLowerCase().trim();
        const p2 = (t.player2_name ?? "").toLowerCase().trim();
        return p1 === full || p2 === full || p1.includes(first) || p2.includes(first);
      });

      if (session) {
        if (team && team.net_score != null) {
          await issueStop(session.id, bayNumber, false, "score_posted");
          results.push({ booking: booking.id, action: "stop_score_posted" });
        } else {
          results.push({ booking: booking.id, action: "comp_recording" });
        }
      } else if (team && team.net_score == null) {
        const roundNumber = (sessionCountByBooking.get(booking.id) ?? 0) + 1;
        const newId = await issueStart({
          booking_id: booking.id,
          bay_number: bayNumber,
          trigger_source: "local_comp",
          sgt_user_id: null,
          sgt_tournament_id: null,
          player_name: playerName,
          tournament_name: `Local Comp — ${activeComp.name}`,
          round_number: roundNumber,
        });
        if (newId) {
          sessionCountByBooking.set(booking.id, roundNumber);
          results.push({ booking: booking.id, action: "start_comp", round: roundNumber });
        }
      } else {
        results.push({ booking: booking.id, action: "comp_no_team_or_scored" });
      }
      continue;
    }

    results.push({ booking: booking.id, action: "not_eligible" });
  }

  return new Response(
    JSON.stringify({ ok: true, active_bookings: activeBookings.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
