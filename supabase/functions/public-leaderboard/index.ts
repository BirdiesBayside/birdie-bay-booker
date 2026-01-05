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
    const action = url.searchParams.get("action");
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        const tourId = url.searchParams.get("tourId");
        const grossOrNet = url.searchParams.get("grossOrNet") || "net";
        
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
        const tourId = url.searchParams.get("tourId");
        
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

      case "tournament-results": {
        const tournamentId = url.searchParams.get("tournamentId");
        const grossOrNet = url.searchParams.get("grossOrNet") || "net";
        
        if (!tournamentId) {
          return new Response(JSON.stringify({ error: "tournamentId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Get scorecards for this tournament, including round number
        const { data: scorecards, error } = await supabase
          .from("sgt_scorecards")
          .select("player_name, player_id, hcp_index, total_gross, total_net, to_par_gross, to_par_net, course_name, round")
          .eq("tournament_id", parseInt(tournamentId))
          .order("player_name", { ascending: true })
          .order("round", { ascending: true });

        if (error) throw error;

        // Group scorecards by player and consolidate rounds
        const playerMap = new Map<number, {
          playerName: string;
          hcp: number | null;
          rounds: { round: number; score: number | null; toPar: number | null }[];
          totalScore: number;
          totalToPar: number;
          courseName: string | null;
        }>();

        for (const card of scorecards || []) {
          const score = grossOrNet === "gross" ? card.total_gross : card.total_net;
          const toPar = grossOrNet === "gross" ? card.to_par_gross : card.to_par_net;
          const roundNum = card.round || 1;

          if (!playerMap.has(card.player_id)) {
            playerMap.set(card.player_id, {
              playerName: card.player_name,
              hcp: card.hcp_index,
              rounds: [],
              totalScore: 0,
              totalToPar: 0,
              courseName: card.course_name,
            });
          }

          const player = playerMap.get(card.player_id)!;
          player.rounds.push({ round: roundNum, score, toPar });
          if (score !== null) player.totalScore += score;
          if (toPar !== null) player.totalToPar += toPar;
        }

        // Convert to array and sort by total score
        const results = Array.from(playerMap.values())
          .filter(p => p.rounds.length > 0)
          .sort((a, b) => a.totalScore - b.totalScore)
          .map((player, index) => ({
            position: index + 1,
            playerName: player.playerName,
            hcp: player.hcp,
            rd1: player.rounds.find(r => r.round === 1)?.score ?? null,
            rd1ToPar: player.rounds.find(r => r.round === 1)?.toPar ?? null,
            rd2: player.rounds.find(r => r.round === 2)?.score ?? null,
            rd2ToPar: player.rounds.find(r => r.round === 2)?.toPar ?? null,
            total: player.totalScore,
            toPar: player.totalToPar,
            courseName: player.courseName,
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
