// Generates a social-ready written recap of an SGT tournament from its scorecards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

type Hole = { num: number; par: number; gross: number; net: number };

function holes(hole_data: Record<string, number> | null): Hole[] {
  if (!hole_data) return [];
  const out: Hole[] = [];
  for (let i = 1; i <= 18; i++) {
    const par = Number(hole_data[`h${i}_Par`]);
    const gross = Number(hole_data[`hole${i}_gross`]);
    const net = Number(hole_data[`hole${i}_net`]);
    if (!par || !gross) continue;
    out.push({ num: i, par, gross, net });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { tournament_id } = await req.json();
    if (!tournament_id) {
      return new Response(JSON.stringify({ error: "tournament_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tournament } = await admin
      .from("sgt_tournaments")
      .select("tournament_id, name, course_name, start_date, end_date, tour_id")
      .eq("tournament_id", tournament_id)
      .maybeSingle();

    const { data: cards, error } = await admin
      .from("sgt_scorecards")
      .select("*")
      .eq("tournament_id", tournament_id);
    if (error) throw error;

    if (!cards || cards.length === 0) {
      return new Response(JSON.stringify({ error: "No scorecards found for this tournament." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Previous tournaments on the same tour (for form comparison)
    let prior: any[] = [];
    if (tournament?.tour_id && tournament?.start_date) {
      const { data: priorTourneys } = await admin
        .from("sgt_tournaments")
        .select("tournament_id, name, start_date")
        .eq("tour_id", tournament.tour_id)
        .lt("start_date", tournament.start_date)
        .order("start_date", { ascending: false })
        .limit(3);
      const ids = (priorTourneys || []).map((t) => t.tournament_id);
      if (ids.length) {
        const { data: priorCards } = await admin
          .from("sgt_scorecards")
          .select("tournament_id, player_name, total_gross, total_net, to_par_net")
          .in("tournament_id", ids);
        prior = priorCards || [];
      }
    }

    // ---- Build per-player summaries ----
    const byPlayer = new Map<string, any>();
    const holeStats = new Map<number, { par: number; scores: number[] }>();
    const aces: string[] = [];
    const eaglesPlus: string[] = [];

    // A round only counts as complete if all 18 holes were played (DNF otherwise)
    const isFull18 = (c: any): boolean => {
      const hd = c.hole_data as Record<string, unknown> | null;
      if (hd && typeof hd === "object") {
        let played = 0;
        for (let i = 1; i <= 18; i++) {
          const g = Number(hd[`hole${i}_gross`]);
          if (Number.isFinite(g) && g > 0) played++;
        }
        return played === 18;
      }
      return Number(c.out_gross) > 0 && Number(c.in_gross) > 0;
    };

    for (const c of cards) {
      const hs = holes(c.hole_data as any);
      const full18 = isFull18(c);
      const holesPlayed = hs.length > 0 ? hs.length : (Number(c.out_gross) > 0 && Number(c.in_gross) > 0 ? 18 : Number(c.out_gross) > 0 || Number(c.in_gross) > 0 ? 9 : 0);
      for (const h of hs) {
        if (!holeStats.has(h.num)) holeStats.set(h.num, { par: h.par, scores: [] });
        holeStats.get(h.num)!.scores.push(h.gross);
        if (h.gross === 1) aces.push(`${c.player_name} — hole ${h.num} (par ${h.par}), round ${c.round}`);
        else if (h.gross <= h.par - 2)
          eaglesPlus.push(`${c.player_name} — hole ${h.num} (par ${h.par}) in ${h.gross}, round ${c.round}`);
      }

      const birdies = hs.filter((h) => h.gross === h.par - 1).length;
      const pars = hs.filter((h) => h.gross === h.par).length;
      const doublePlus = hs.filter((h) => h.gross >= h.par + 2).length;

      const p = byPlayer.get(c.player_name) || {
        player: c.player_name,
        hcp: c.hcp_index,
        rounds: [] as any[],
      };
      p.rounds.push({
        round: c.round,
        gross: c.total_gross,
        net: c.total_net,
        to_par_gross: c.to_par_gross,
        to_par_net: c.to_par_net,
        front9_gross: c.out_gross,
        back9_gross: c.in_gross,
        full_18: full18,
        holes_played: holesPlayed,
        dnf: !full18,
        birdies,
        pars,
        double_or_worse: doublePlus,
        best_hole_run: hs.length ? Math.min(...hs.map((h) => h.gross - h.par)) : null,
      });
      byPlayer.set(c.player_name, p);
    }

    const players = [...byPlayer.values()].map((p) => {
      const fullRounds = p.rounds.filter((r: any) => r.net != null && r.full_18);
      const dnfRounds = p.rounds.filter((r: any) => !r.full_18);
      const netSum = fullRounds.reduce((s: number, r: any) => s + (r.to_par_net ?? 0), 0);
      const grossSum = fullRounds.reduce((s: number, r: any) => s + (r.to_par_gross ?? 0), 0);
      const priorNets = prior
        .filter((x) => x.player_name === p.player && x.to_par_net != null)
        .map((x) => x.to_par_net as number);
      const priorAvg = priorNets.length
        ? +(priorNets.reduce((a, b) => a + b, 0) / priorNets.length).toFixed(1)
        : null;
      const thisAvg = fullRounds.length ? +(netSum / fullRounds.length).toFixed(1) : null;
      // The weekly league is two 18-hole rounds: a player must complete BOTH
      // full rounds to be eligible for the win. Anything less is a DNF.
      const eligible = fullRounds.length >= 2 && dnfRounds.length === 0;
      return {
        ...p,
        rounds_completed_full_18: fullRounds.length,
        dnf_rounds: dnfRounds.map((r: any) => ({ round: r.round, holes_played: r.holes_played })),
        eligible_for_win: eligible,
        dnf: !eligible,
        total_to_par_net: netSum,
        total_to_par_gross: grossSum,
        avg_to_par_net: thisAvg,
        prior_avg_to_par_net: priorAvg,
        improvement_vs_recent_form:
          priorAvg != null && thisAvg != null ? +(priorAvg - thisAvg).toFixed(1) : null,
      };
    });

    const leaderboard = players
      .filter((p) => p.eligible_for_win)
      .sort((a, b) => a.total_to_par_net - b.total_to_par_net);

    const dnfPlayers = players
      .filter((p) => !p.eligible_for_win)
      .map((p) => ({
        player: p.player,
        full_rounds_completed: p.rounds_completed_full_18,
        dnf_rounds: p.dnf_rounds,
        total_to_par_net: p.total_to_par_net,
        note: "DNF — did not complete both 18-hole rounds; NOT eligible for the win",
      }));

    const hardestHoles = [...holeStats.entries()]
      .map(([num, h]) => ({
        hole: num,
        par: h.par,
        avg_to_par: +(h.scores.reduce((a, b) => a + b, 0) / h.scores.length - h.par).toFixed(2),
        plays: h.scores.length,
      }))
      .sort((a, b) => b.avg_to_par - a.avg_to_par);

    const payload = {
      tournament: {
        name: tournament?.name,
        course: tournament?.course_name,
        start_date: tournament?.start_date,
        end_date: tournament?.end_date,
      },
      field_size: players.length,
      total_rounds: cards.length,
      leaderboard: leaderboard.slice(0, 20),
      dnf_players: dnfPlayers,
      lowest_gross_rounds: cards
        .filter((c) => c.total_gross != null && isFull18(c))
        .sort((a, b) => (a.to_par_gross ?? 0) - (b.to_par_gross ?? 0))
        .slice(0, 5)
        .map((c) => ({
          player: c.player_name,
          round: c.round,
          gross: c.total_gross,
          to_par_gross: c.to_par_gross,
        })),
      hole_in_ones: aces,
      eagles_or_better: eaglesPlus.slice(0, 15),
      hardest_holes: hardestHoles.slice(0, 3),
      easiest_holes: hardestHoles.slice(-3).reverse(),
    };

    const systemPrompt = `You are the resident writer for Birdies Bayside's indoor golf league (SGT). You write the weekly tournament wrap that gets posted straight to social media.

Voice: plain, understated, factual. Write like a club captain typing up the week's results — dry, matter-of-fact, occasionally a small wry aside. Never breathless. Australian English.

Hard rules:
- No hype language, no sports-cliché metaphors, no purple prose. Banned outright: "chasing shadows", "scorching", "on fire", "pure ball-striking display", "statement round", "clinic", "dominant display", "showed no mercy", "held their nerve", "the field could only watch", "carnage", "fireworks", "cruised", "stormed", "surge", "blistering", "commanding", "dispatched", and anything of that flavour. If a phrase sounds like TV commentary, cut it.
- Describe what happened using the numbers, not adjectives. "Won by four shots at eight under net" beats any dramatic wording.
- At most one light joke or wry line in the whole piece. Zero is fine.
- Never mention AI, data, algorithms, "analysis", "insights", or that you were given statistics.
- No emoji, no hashtags, no corporate filler, no "Ladies and gentlemen", no "buckle up", no rhetorical question openers.
- Only state facts present in the supplied numbers. Never invent shots, weather, quotes or drama that isn't in the data.
- Handicaps are in play: results are decided on net score to par (lower is better). Mention gross when it's genuinely impressive.
- DNF rules (critical): the tournament is two 18-hole rounds. A player who did not complete BOTH full 18-hole rounds is a DNF (did not finish) and CANNOT win or be placed — no matter how good their partial score looks. Only players in "leaderboard" (all have eligible_for_win: true) can be called the winner or given a finishing position. Players in "dnf_players" may get at most one brief, plain sentence noting they didn't finish (e.g. "X only got through nine holes of round two, so no result"), and only if it's genuinely noteworthy. NEVER present a DNF player's score as a win, podium, or ranking.
- 180–280 words. Plain text with short paragraphs, no markdown headings, no bullet lists.

Structure loosely: open on the winner and their score, then anyone who moved up or improved on their recent form, call out any hole-in-one or eagle (a hole-in-one leads if there is one), note the hole that played hardest, and finish with a plain line about next week.`;


    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Write this week's wrap. Numbers below (net to par: negative is under par, lower wins; improvement_vs_recent_form is strokes better than that player's recent average, positive = improved). Only the "leaderboard" players completed both 18-hole rounds and can win — anyone in "dnf_players" did not finish and must never be named winner or given a placing.\n\n${JSON.stringify(payload)}`,
          },
        ],
      }),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in Settings → Workspace → Usage." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway ${res.status}: ${t}`);
    }

    const json = await res.json();
    const commentary = json.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ commentary, summary: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sgt-tournament-commentary error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
