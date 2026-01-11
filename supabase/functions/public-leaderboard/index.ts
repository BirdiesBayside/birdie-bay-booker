import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: Record<string, unknown> | null = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await req.json();
      } catch {
        body = null;
      }
    }

    const getParam = (key: string) => {
      const fromQuery = url.searchParams.get(key);
      if (fromQuery !== null) return fromQuery;
      const fromBody = body?.[key];
      if (typeof fromBody === "string" || typeof fromBody === "number") return String(fromBody);
      return null;
    };

    const action = getParam("action");

    console.log(`[PUBLIC-LEADERBOARD] Action: ${action}`);

    switch (action) {
      case "tours": {
        // Get all active tours (public data only)
        const { data: tours, error } = await supabase
          .from("sgt_tours")
          .select("tour_id, name, active, start_date, end_date")
          .order("active", { ascending: false })
          .order("start_date", { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({ tours }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "standings": {
        const tourId = getParam("tourId");
        const grossOrNet = getParam("grossOrNet") || "net";
        if (!tourId) {
          return new Response(JSON.stringify({ error: "tourId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get standings - public player data only
        const { data: standings, error } = await supabase
          .from("sgt_tour_standings")
          .select("position, user_name, hcp, events, first, top5, top10, points")
          .eq("tour_id", parseInt(tourId))
          .eq("gross_or_net", grossOrNet)
          .order("position", { ascending: true });

        if (error) throw error;

        return new Response(JSON.stringify({ standings: standings || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "tournaments": {
        const tourId = getParam("tourId");
        if (!tourId) {
          return new Response(JSON.stringify({ error: "tourId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get tournaments that have started or completed
        const today = new Date().toISOString().split('T')[0];
        const { data: tournaments, error } = await supabase
          .from("sgt_tournaments")
          .select("tournament_id, name, course_name, start_date, end_date, status")
          .eq("tour_id", parseInt(tourId))
          .or(`status.eq.Completed,status.eq.In Progress,start_date.lte.${today}`)
          .order("start_date", { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({ tournaments: tournaments || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "last-completed-tournament": {
        // Get the most recently completed tournament across ALL tours
        const today = new Date().toISOString().split('T')[0];
        const { data: tournaments, error } = await supabase
          .from("sgt_tournaments")
          .select("tournament_id, name, course_name, start_date, end_date, status, tour_id")
          .eq("status", "Completed")
          .order("end_date", { ascending: false })
          .limit(1);

        if (error) throw error;

        const tournament = tournaments?.[0] || null;

        // Also get the tour name for context
        let tourName = null;
        if (tournament) {
          const { data: tour } = await supabase
            .from("sgt_tours")
            .select("name")
            .eq("tour_id", tournament.tour_id)
            .single();
          tourName = tour?.name || null;
        }

        return new Response(JSON.stringify({ tournament, tourName }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "tournament-results": {
        const tournamentId = getParam("tournamentId");
        const grossOrNet = (getParam("grossOrNet") || "net") as "gross" | "net";
        if (!tournamentId) {
          return new Response(JSON.stringify({ error: "tournamentId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const isRoundComplete = (holeData: unknown) => {
          if (!holeData || typeof holeData !== "object") return false;
          const data = holeData as Record<string, unknown>;

          for (let hole = 1; hole <= 18; hole++) {
            const key = `hole${hole}_${grossOrNet}`;
            const raw = data[key];
            const num = typeof raw === "number" ? raw : Number(raw);
            // Golf strokes can't be 0; 0/NaN/null means no score recorded.
            if (!Number.isFinite(num) || num <= 0) return false;
          }

          return true;
        };

        // Get scorecards for this tournament, including per-hole data so we can detect DNFs
        const { data: scorecards, error } = await supabase
          .from("sgt_scorecards")
          .select(
            "player_name, player_id, hcp_index, total_gross, total_net, to_par_gross, to_par_net, course_name, round, hole_data",
          )
          .eq("tournament_id", parseInt(tournamentId))
          .order("player_name", { ascending: true })
          .order("round", { ascending: true });

        if (error) throw error;

        type RoundNum = 1 | 2;
        type RoundInfo = {
          score: number | null;
          toPar: number | null;
          complete: boolean;
        };

        const playerMap = new Map<
          number,
          {
            playerName: string;
            hcp: number | null;
            courseName: string | null;
            rounds: Record<RoundNum, RoundInfo>;
          }
        >();

        for (const card of scorecards || []) {
          const roundNum = (card.round === 2 ? 2 : 1) as RoundNum;
          const complete = isRoundComplete(card.hole_data);

          if (!playerMap.has(card.player_id)) {
            playerMap.set(card.player_id, {
              playerName: card.player_name,
              hcp: card.hcp_index,
              courseName: card.course_name,
              rounds: {
                1: { score: null, toPar: null, complete: false },
                2: { score: null, toPar: null, complete: false },
              },
            });
          }

          const player = playerMap.get(card.player_id)!;

          const score = grossOrNet === "gross" ? card.total_gross : card.total_net;
          const toPar = grossOrNet === "gross" ? card.to_par_gross : card.to_par_net;

          player.rounds[roundNum] = {
            score: complete ? score : null,
            toPar: complete ? toPar : null,
            complete,
          };
        }

        const results = Array.from(playerMap.values())
          .filter((p) => p.playerName)
          .map((p) => {
            const rd1 = p.rounds[1];
            const rd2 = p.rounds[2];
            const dnf = !rd1.complete || !rd2.complete;

            const total = dnf || rd1.score === null || rd2.score === null ? null : rd1.score + rd2.score;
            const toPar = dnf || rd1.toPar === null || rd2.toPar === null ? null : rd1.toPar + rd2.toPar;

            return {
              playerName: p.playerName,
              hcp: p.hcp,
              rd1: rd1.score,
              rd1ToPar: rd1.toPar,
              rd2: rd2.score,
              rd2ToPar: rd2.toPar,
              total,
              toPar,
              courseName: p.courseName,
              dnf,
            };
          })
          .sort((a, b) => {
            if (a.dnf !== b.dnf) return a.dnf ? 1 : -1; // DNFs always bottom
            if (a.total === null && b.total === null) return a.playerName.localeCompare(b.playerName);
            if (a.total === null) return 1;
            if (b.total === null) return -1;
            return a.total - b.total;
          })
          .map((player, index) => ({
            position: index + 1,
            ...player,
          }));

        return new Response(JSON.stringify({ results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action. Use: tours, standings, tournaments, tournament-results" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("[PUBLIC-LEADERBOARD] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
