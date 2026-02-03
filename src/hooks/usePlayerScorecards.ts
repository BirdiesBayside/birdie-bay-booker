import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { QUERY_KEYS, STALE_TIMES } from "@/lib/query-keys";

export interface CachedScorecard {
  tournament_id: number;
  player_id: number;
  player_name: string;
  hcp_index: number | null;
  round: number | null;
  course_name: string | null;
  teetype: string | null;
  rating: number | null;
  slope: number | null;
  total_gross: number | null;
  total_net: number | null;
  to_par_gross: number | null;
  to_par_net: number | null;
  in_gross: number | null;
  out_gross: number | null;
  in_net: number | null;
  out_net: number | null;
  hole_data: Record<string, unknown> | null;
}

export interface PlayerRoundWithScorecard {
  tournamentId: number;
  tournamentName: string;
  courseName: string;
  date: string;
  status: string;
  scorecard: CachedScorecard | null;
}

/**
 * Fetches player rounds with on-demand scorecard caching.
 * 
 * Strategy:
 * 1. Get user's SGT ID from profile
 * 2. Get all tournaments the user has played (from sgt_scorecards)
 * 3. For completed tournaments: use cached scorecards from DB
 * 4. For in-progress tournaments: fetch on-demand and cache
 * 
 * This minimizes API calls by:
 * - Using DB cache for all completed tournaments
 * - Only fetching in-progress scorecards when user views them
 * - Caching fetched scorecards so they're never fetched again
 */
export function usePlayerScorecards() {
  return useQuery({
    queryKey: ['player-scorecards'],
    queryFn: async (): Promise<PlayerRoundWithScorecard[]> => {
      // Get current user's SGT ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("sgt_user_id")
        .eq("user_id", user.id)
        .single();

      if (!profile?.sgt_user_id) {
        return []; // User not linked to SGT
      }

      const sgtUserId = profile.sgt_user_id;

      // Get all scorecards for this player from our database cache
      const { data: cachedScorecards } = await supabase
        .from("sgt_scorecards")
        .select(`
          tournament_id,
          player_id,
          player_name,
          hcp_index,
          round,
          course_name,
          teetype,
          rating,
          slope,
          total_gross,
          total_net,
          to_par_gross,
          to_par_net,
          in_gross,
          out_gross,
          in_net,
          out_net,
          hole_data
        `)
        .eq("player_id", sgtUserId)
        .order("tournament_id", { ascending: false });

      if (!cachedScorecards || cachedScorecards.length === 0) {
        return [];
      }

      // Get tournament details for these scorecards
      const tournamentIds = [...new Set(cachedScorecards.map(s => s.tournament_id))];
      
      const { data: tournaments } = await supabase
        .from("sgt_tournaments")
        .select("tournament_id, name, course_name, status, start_date")
        .in("tournament_id", tournamentIds);

      const tournamentMap = new Map(
        (tournaments || []).map(t => [t.tournament_id, t])
      );

      // Build rounds with scorecards
      const rounds: PlayerRoundWithScorecard[] = cachedScorecards.map(scorecard => {
        const tournament = tournamentMap.get(scorecard.tournament_id);
        
        return {
          tournamentId: scorecard.tournament_id,
          tournamentName: tournament?.name || `Tournament ${scorecard.tournament_id}`,
          courseName: scorecard.course_name || tournament?.course_name || "Unknown Course",
          date: tournament?.start_date || new Date().toISOString(),
          status: tournament?.status || "Unknown",
          scorecard: {
            ...scorecard,
            hole_data: scorecard.hole_data as Record<string, unknown> | null,
          },
        };
      });

      // Sort by date descending
      rounds.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return rounds;
    },
    staleTime: STALE_TIMES.SEMI_STATIC, // 5 minutes - scorecards don't change once completed
  });
}

/**
 * Fetches a specific scorecard on-demand if not in cache.
 * Used when user clicks to view a specific round.
 */
export function useFetchScorecardOnDemand() {
  const fetchScorecard = async (tournamentId: number, playerId: number): Promise<CachedScorecard | null> => {
    // First check if we already have it cached
    const { data: existing } = await supabase
      .from("sgt_scorecards")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId)
      .single();

    if (existing) {
      return existing as unknown as CachedScorecard;
    }

    // Not in cache - fetch from API and cache it
    console.log(`[Scorecard] Fetching on-demand for tournament ${tournamentId}, player ${playerId}`);
    
    const { data, error } = await supabase.functions.invoke("sgt-api", {
      body: { 
        action: "scorecards", 
        params: { tournamentId: tournamentId.toString() } 
      },
    });

    if (error) {
      console.error("Failed to fetch scorecard:", error);
      return null;
    }

    const scorecards = Array.isArray(data) ? data : [];
    const playerScorecard = scorecards.find((sc: Record<string, unknown>) => sc.playerId === playerId);

    if (!playerScorecard) {
      return null;
    }

    // Cache it in the database for future use
    const holeData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(playerScorecard)) {
      if (/^h\d+/.test(key) || /^hole\d+/.test(key)) {
        holeData[key] = value;
      }
    }

    // Note: We use insert here since upsert with the specific columns requires proper typing
    // The database constraint will handle duplicates - we ignore errors for duplicates
    const scorecardToInsert = {
      tournament_id: tournamentId,
      player_id: playerId,
      player_name: playerScorecard.player_name as string,
      hcp_index: playerScorecard.hcp_index as number,
      round: (playerScorecard.round as number) ?? 1,
      course_name: playerScorecard.courseName as string,
      teetype: playerScorecard.teetype as string,
      rating: playerScorecard.rating as number,
      slope: playerScorecard.slope as number,
      total_gross: playerScorecard.total_gross as number,
      total_net: playerScorecard.total_net as number,
      to_par_gross: playerScorecard.toPar_gross as number,
      to_par_net: playerScorecard.toPar_net as number,
      in_gross: playerScorecard.in_gross as number,
      out_gross: playerScorecard.out_gross as number,
      in_net: playerScorecard.in_net as number,
      out_net: playerScorecard.out_net as number,
      hole_data: holeData,
    };

    // Use RPC or direct SQL via edge function would be better, but for now just try insert
    // If it fails due to conflict, that's fine - data already exists
    try {
      await supabase.functions.invoke("sgt-api", {
        body: { 
          action: "cache-scorecard", 
          params: scorecardToInsert 
        },
      });
    } catch (e) {
      // Ignore caching errors - data will be fetched again next time
      console.warn("Failed to cache scorecard:", e);
    }

    console.log(`[Scorecard] Fetched scorecard for tournament ${tournamentId}, player ${playerId}`);
    
    // Return the scorecard we just fetched
    return {
      tournament_id: tournamentId,
      player_id: playerId,
      player_name: playerScorecard.player_name as string,
      hcp_index: playerScorecard.hcp_index as number | null,
      round: (playerScorecard.round as number) ?? 1,
      course_name: playerScorecard.courseName as string | null,
      teetype: playerScorecard.teetype as string | null,
      rating: playerScorecard.rating as number | null,
      slope: playerScorecard.slope as number | null,
      total_gross: playerScorecard.total_gross as number | null,
      total_net: playerScorecard.total_net as number | null,
      to_par_gross: playerScorecard.toPar_gross as number | null,
      to_par_net: playerScorecard.toPar_net as number | null,
      in_gross: playerScorecard.in_gross as number | null,
      out_gross: playerScorecard.out_gross as number | null,
      in_net: playerScorecard.in_net as number | null,
      out_net: playerScorecard.out_net as number | null,
      hole_data: holeData,
    } as CachedScorecard;
  };

  return { fetchScorecard };
}
