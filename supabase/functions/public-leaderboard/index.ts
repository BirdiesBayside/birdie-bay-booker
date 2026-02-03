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

        // Get current date in Brisbane timezone (AEST/AEDT)
        const brisbaneNow = new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane" });
        const brisbaneParts = brisbaneNow.split(/[/,\s:]+/);
        // Format: DD/MM/YYYY, HH:MM:SS AM/PM -> YYYY-MM-DD
        const brisbaneToday = `${brisbaneParts[2]}-${brisbaneParts[1].padStart(2, '0')}-${brisbaneParts[0].padStart(2, '0')}`;
        console.log(`[PUBLIC-LEADERBOARD] Brisbane today: ${brisbaneToday}`);

        // Get tournaments that have actually started (start_date <= today) or completed
        const { data: tournaments, error } = await supabase
          .from("sgt_tournaments")
          .select("tournament_id, name, course_name, start_date, end_date, status")
          .eq("tour_id", parseInt(tourId))
          .or("status.eq.Completed,status.eq.In Progress")
          .lte("start_date", brisbaneToday)
          .order("start_date", { ascending: false });

        if (error) throw error;

        return new Response(JSON.stringify({ tournaments: tournaments || [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "last-completed-tournament": {
        // Get the "previous week" tournament - the one before the current active tournament
        // This could be "Completed" or still "In Progress" if current week is underway
        
        // Get Brisbane timezone date
        const brisbaneNow = new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane" });
        const brisbaneParts = brisbaneNow.split(/[/,\s:]+/);
        const brisbaneToday = `${brisbaneParts[2]}-${brisbaneParts[1].padStart(2, '0')}-${brisbaneParts[0].padStart(2, '0')}`;
        
        console.log(`[PUBLIC-LEADERBOARD] last-completed-tournament: Brisbane today = ${brisbaneToday}`);
        
        // Get tournaments that have started, ordered by start date descending
        // We want the second one (previous week) - skip the current active tournament
        const { data: tournaments, error } = await supabase
          .from("sgt_tournaments")
          .select("tournament_id, name, course_name, start_date, end_date, status, tour_id")
          .or("status.eq.Completed,status.eq.In Progress")
          .lte("start_date", brisbaneToday)
          .order("start_date", { ascending: false })
          .limit(2);

        if (error) throw error;
        
        console.log(`[PUBLIC-LEADERBOARD] Found ${tournaments?.length || 0} tournaments`);
        tournaments?.forEach((t, i) => console.log(`  [${i}] ${t.name} - ${t.status} (start: ${t.start_date})`));

        // Get the second tournament (previous week) if available, otherwise the first
        // If current week has started, tournaments[0] is current, tournaments[1] is previous
        // We want the "previous" one for the Last Week display
        const tournament = tournaments && tournaments.length >= 2 
          ? tournaments[1] 
          : tournaments?.[0] || null;
        
        console.log(`[PUBLIC-LEADERBOARD] Selected tournament: ${tournament?.name || 'none'}`);

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
        
        // Helper to count completed holes from hole_data
        const countCompletedHoles = (holeData: unknown, scoreType: "gross" | "net"): number => {
          if (!holeData || typeof holeData !== "object") return 0;
          const data = holeData as Record<string, unknown>;
          let count = 0;
          for (let hole = 1; hole <= 18; hole++) {
            const key = `hole${hole}_${scoreType}`;
            const raw = data[key];
            const num = typeof raw === "number" ? raw : Number(raw);
            if (Number.isFinite(num) && num > 0) count++;
          }
          return count;
        };
        
        type RoundInfo = {
          score: number | null;
          toPar: number | null;
          holesCompleted: number;
          isComplete: boolean;
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
          
          // Count holes completed in this round
          const holesCompleted = countCompletedHoles(card.hole_data, grossOrNet);
          const isRoundComplete = holesCompleted === 18;
          
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
              holesCompleted,
              isComplete: isRoundComplete,
            };
            // Only count as completed round if all 18 holes are done
            if (isRoundComplete) {
              player.completedRounds++;
            }
          }
        }

        const results = Array.from(playerMap.values())
          .filter((p) => p.playerName)
          .map((p) => {
            const rd1 = p.rounds[1] || { score: null, toPar: null, holesCompleted: 0, isComplete: false };
            const rd2 = p.rounds[2] || { score: null, toPar: null, holesCompleted: 0, isComplete: false };
            
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

            // For completed tournaments, mark as DNF if they didn't finish all expected rounds
            // For in-progress tournaments, just show their current total
            const dnf = isCompleted && p.completedRounds < maxRound;
            
            // Figure out the "thru" status - which hole they're on in their current round
            let thru: number | null = null;
            if (!isCompleted) {
              // If round 2 exists but incomplete
              if (rd2.score !== null && !rd2.isComplete) {
                thru = rd2.holesCompleted;
              }
              // If round 1 exists but incomplete (and no round 2)
              else if (rd1.score !== null && !rd1.isComplete && rd2.score === null) {
                thru = rd1.holesCompleted;
              }
              // If round 1 complete but no round 2 started in a multi-round tournament
              else if (rd1.isComplete && rd2.score === null && maxRound >= 2) {
                thru = null; // They've finished Rd1, waiting for Rd2
              }
            }

            return {
              playerName: p.playerName,
              hcp: p.hcp,
              rd1: rd1.score,
              rd1ToPar: rd1.toPar,
              rd1Thru: rd1.isComplete ? null : (rd1.holesCompleted > 0 ? rd1.holesCompleted : null),
              rd2: rd2.score,
              rd2ToPar: rd2.toPar,
              rd2Thru: rd2.isComplete ? null : (rd2.holesCompleted > 0 ? rd2.holesCompleted : null),
              total: dnf ? null : total,
              toPar: dnf ? null : toPar,
              courseName: p.courseName,
              dnf,
              roundsCompleted: p.completedRounds,
              thru,
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
