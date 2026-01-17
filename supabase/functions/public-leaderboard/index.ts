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

        // Fetch the tournament to check its status and get expected rounds
        const { data: tournament, error: tournamentError } = await supabase
          .from("sgt_tournaments")
          .select("status, name")
          .eq("tournament_id", parseInt(tournamentId))
          .single();

        if (tournamentError) {
          console.error("[PUBLIC-LEADERBOARD] Error fetching tournament:", tournamentError);
        }

        const isCompleted = tournament?.status === "Completed";
        const isInProgress = tournament?.status === "In Progress";

        // Get scorecards for this tournament
        const { data: scorecards, error } = await supabase
          .from("sgt_scorecards")
          .select(
            "player_name, player_id, hcp_index, total_gross, total_net, to_par_gross, to_par_net, course_name, round, hole_data",
          )
          .eq("tournament_id", parseInt(tournamentId))
          .order("player_name", { ascending: true })
          .order("round", { ascending: true });

        if (error) throw error;

        // Determine total rounds expected based on scorecard data
        const maxRound = Math.max(1, ...(scorecards?.map(s => s.round || 1) || [1]));
        
        type RoundInfo = {
          score: number | null;
          toPar: number | null;
        };

        const playerMap = new Map<
          number,
          {
            playerName: string;
            hcp: number | null;
            courseName: string | null;
            rounds: Record<number, RoundInfo>;
            completedRounds: number;
          }
        >();

        for (const card of scorecards || []) {
          const roundNum = card.round || 1;
          
          // Check if this round has actual scores (not just a placeholder)
          const hasScore = grossOrNet === "gross" 
            ? card.total_gross !== null && card.total_gross > 0
            : card.total_net !== null && card.total_net > 0;

          if (!playerMap.has(card.player_id)) {
            playerMap.set(card.player_id, {
              playerName: card.player_name,
              hcp: card.hcp_index,
              courseName: card.course_name,
              rounds: {},
              completedRounds: 0,
            });
          }

          const player = playerMap.get(card.player_id)!;
          
          if (hasScore) {
            const score = grossOrNet === "gross" ? card.total_gross : card.total_net;
            const toPar = grossOrNet === "gross" ? card.to_par_gross : card.to_par_net;

            player.rounds[roundNum] = {
              score,
              toPar,
            };
            player.completedRounds++;
          }
        }

        const results = Array.from(playerMap.values())
          .filter((p) => p.playerName)
          .map((p) => {
            const rd1 = p.rounds[1] || { score: null, toPar: null };
            const rd2 = p.rounds[2] || { score: null, toPar: null };
            
            // Calculate totals from completed rounds
            let total: number | null = null;
            let toPar: number | null = null;
            
            if (rd1.score !== null) {
              total = rd1.score;
              toPar = rd1.toPar;
              
              if (rd2.score !== null) {
                total += rd2.score;
                toPar = (rd1.toPar || 0) + (rd2.toPar || 0);
              }
            }

            // For completed tournaments, mark as DNF if they didn't finish all rounds
            // For in-progress tournaments, just show their current total
            const dnf = isCompleted && p.completedRounds < maxRound;

            return {
              playerName: p.playerName,
              hcp: p.hcp,
              rd1: rd1.score,
              rd1ToPar: rd1.toPar,
              rd2: rd2.score,
              rd2ToPar: rd2.toPar,
              total: dnf ? null : total,
              toPar: dnf ? null : toPar,
              courseName: p.courseName,
              dnf,
              roundsCompleted: p.completedRounds,
            };
          })
          .sort((a, b) => {
            // DNFs always at the bottom
            if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
            
            // Sort by toPar (lowest first for golf)
            if (a.toPar !== null && b.toPar !== null) {
              if (a.toPar !== b.toPar) return a.toPar - b.toPar;
              // If same toPar, player with more rounds completed ranks higher
              if (a.roundsCompleted !== b.roundsCompleted) return b.roundsCompleted - a.roundsCompleted;
            }
            
            // Players with scores before those without
            if (a.toPar === null && b.toPar !== null) return 1;
            if (a.toPar !== null && b.toPar === null) return -1;
            
            // Alphabetical as last resort
            return a.playerName.localeCompare(b.playerName);
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
