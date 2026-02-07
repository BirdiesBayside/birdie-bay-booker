import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScorecardData {
  player_id: number;
  player_name: string;
  tournament_id: number;
  to_par_net: number | null;
  to_par_gross: number | null;
}

interface TournamentData {
  tournament_id: number;
  tour_id: number;
  start_date: string;
  status: string;
}

interface MonthlyStanding {
  tour_id: number;
  month: string;
  player_id: number;
  player_name: string;
  total_net_score: number;
  total_gross_score: number;
  tournaments_played: number;
  best_net: number;
  best_gross: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check for sync secret OR admin user
  const syncSecret = req.headers.get("x-sync-secret");
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  
  let authorized = false;
  
  if (expectedSecret && syncSecret === expectedSecret) {
    authorized = true;
  }
  
  if (!authorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      
      const { data: { user } } = await userClient.auth.getUser(token);
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin");
        
        if (roles && roles.length > 0) {
          authorized = true;
          console.log(`[MONTHLY-STANDINGS] Triggered by admin user: ${user.email}`);
        }
      }
    }
  }
  
  if (!authorized) {
    console.error("[MONTHLY-STANDINGS] Unauthorized attempt");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Parse optional month filter from request body
    let targetMonth: string | null = null;
    try {
      const body = await req.json();
      targetMonth = body?.month || null;
    } catch {
      // No body or invalid JSON - calculate for all recent months
    }

    console.log(`[MONTHLY-STANDINGS] Starting calculation${targetMonth ? ` for ${targetMonth}` : ' for all recent months'}...`);

    // Get active tour
    const { data: activeTour, error: tourError } = await supabase
      .from("sgt_tours")
      .select("tour_id, name")
      .eq("active", 1)
      .limit(1)
      .maybeSingle();

    if (tourError || !activeTour) {
      throw new Error("No active tour found");
    }

    console.log(`[MONTHLY-STANDINGS] Processing tour: ${activeTour.name} (${activeTour.tour_id})`);

    // Get completed tournaments for this tour
    const { data: tournaments, error: tournError } = await supabase
      .from("sgt_tournaments")
      .select("tournament_id, tour_id, start_date, status")
      .eq("tour_id", activeTour.tour_id)
      .eq("status", "Completed")
      .order("start_date", { ascending: false });

    if (tournError) {
      throw new Error(`Failed to fetch tournaments: ${tournError.message}`);
    }

    if (!tournaments || tournaments.length === 0) {
      console.log("[MONTHLY-STANDINGS] No completed tournaments found");
      return new Response(
        JSON.stringify({ success: true, message: "No completed tournaments to process", monthsProcessed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group tournaments by month (format: "February 2026")
    const tournamentsByMonth = new Map<string, TournamentData[]>();
    
    for (const tournament of tournaments as TournamentData[]) {
      if (!tournament.start_date) continue;
      
      const date = new Date(tournament.start_date);
      const monthYear = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      
      // If filtering by specific month, skip others
      if (targetMonth && monthYear !== targetMonth) continue;
      
      if (!tournamentsByMonth.has(monthYear)) {
        tournamentsByMonth.set(monthYear, []);
      }
      tournamentsByMonth.get(monthYear)!.push(tournament);
    }

    console.log(`[MONTHLY-STANDINGS] Found ${tournamentsByMonth.size} months to process`);

    let totalRecords = 0;

    // Process each month
    for (const [month, monthTournaments] of tournamentsByMonth) {
      console.log(`[MONTHLY-STANDINGS] Processing ${month} with ${monthTournaments.length} tournaments`);
      
      const tournamentIds = monthTournaments.map(t => t.tournament_id);
      
      // Get all scorecards for these tournaments
      const { data: scorecards, error: scError } = await supabase
        .from("sgt_scorecards")
        .select("player_id, player_name, tournament_id, to_par_net, to_par_gross")
        .in("tournament_id", tournamentIds);

      if (scError) {
        console.error(`[MONTHLY-STANDINGS] Error fetching scorecards for ${month}:`, scError);
        continue;
      }

      if (!scorecards || scorecards.length === 0) {
        console.log(`[MONTHLY-STANDINGS] No scorecards found for ${month}`);
        continue;
      }

      // Aggregate by player
      // For multi-round tournaments, we need the best round per tournament
      const playerStats = new Map<number, MonthlyStanding>();

      // Group scorecards by player and tournament first
      const playerTournamentScores = new Map<string, ScorecardData[]>();
      
      for (const sc of scorecards as ScorecardData[]) {
        const key = `${sc.player_id}-${sc.tournament_id}`;
        if (!playerTournamentScores.has(key)) {
          playerTournamentScores.set(key, []);
        }
        playerTournamentScores.get(key)!.push(sc);
      }

      // Now calculate best score per tournament for each player
      for (const [key, scores] of playerTournamentScores) {
        const playerId = scores[0].player_id;
        const playerName = scores[0].player_name;
        
        // Take best (lowest) net and gross scores from this tournament
        const validNetScores = scores.filter(s => s.to_par_net !== null).map(s => s.to_par_net!);
        const validGrossScores = scores.filter(s => s.to_par_gross !== null).map(s => s.to_par_gross!);
        
        if (validNetScores.length === 0 && validGrossScores.length === 0) continue;
        
        const bestNet = validNetScores.length > 0 ? Math.min(...validNetScores) : 999;
        const bestGross = validGrossScores.length > 0 ? Math.min(...validGrossScores) : 999;

        if (!playerStats.has(playerId)) {
          playerStats.set(playerId, {
            tour_id: activeTour.tour_id,
            month,
            player_id: playerId,
            player_name: playerName,
            total_net_score: 0,
            total_gross_score: 0,
            tournaments_played: 0,
            best_net: 999,
            best_gross: 999,
          });
        }

        const stats = playerStats.get(playerId)!;
        
        // Sum up tournament scores (lower is better in golf)
        if (bestNet !== 999) {
          stats.total_net_score += bestNet;
        }
        if (bestGross !== 999) {
          stats.total_gross_score += bestGross;
        }
        stats.tournaments_played += 1;
        stats.best_net = Math.min(stats.best_net, bestNet);
        stats.best_gross = Math.min(stats.best_gross, bestGross);
      }

      // Convert to array and calculate positions
      const standings = Array.from(playerStats.values());
      
      // Sort by net score (lower is better) for net position
      standings.sort((a, b) => a.total_net_score - b.total_net_score);
      standings.forEach((s, idx) => {
        (s as MonthlyStanding & { net_position: number }).net_position = idx + 1;
      });
      
      // Create a separate array for gross positions
      const grossRanked = [...standings].sort((a, b) => a.total_gross_score - b.total_gross_score);
      grossRanked.forEach((s, idx) => {
        (s as MonthlyStanding & { gross_position: number }).gross_position = idx + 1;
      });

      // Upsert standings
      for (const standing of standings) {
        const grossPos = grossRanked.findIndex(g => g.player_id === standing.player_id) + 1;
        
        const { error: upsertError } = await supabase
          .from("sgt_monthly_standings")
          .upsert({
            tour_id: standing.tour_id,
            month: standing.month,
            player_id: standing.player_id,
            player_name: standing.player_name,
            total_net_score: standing.total_net_score,
            total_gross_score: standing.total_gross_score,
            tournaments_played: standing.tournaments_played,
            best_net: standing.best_net === 999 ? null : standing.best_net,
            best_gross: standing.best_gross === 999 ? null : standing.best_gross,
            net_position: (standing as MonthlyStanding & { net_position: number }).net_position,
            gross_position: grossPos,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tour_id,month,player_id' });

        if (upsertError) {
          console.error(`[MONTHLY-STANDINGS] Error upserting standing:`, upsertError);
        } else {
          totalRecords++;
        }
      }

      console.log(`[MONTHLY-STANDINGS] Upserted ${standings.length} standings for ${month}`);
    }

    console.log(`[MONTHLY-STANDINGS] ✓ Calculation complete. Total records: ${totalRecords}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalRecords,
        monthsProcessed: tournamentsByMonth.size,
        tourId: activeTour.tour_id
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[MONTHLY-STANDINGS] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
