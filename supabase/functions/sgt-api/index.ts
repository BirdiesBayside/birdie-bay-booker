import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  // Get the authorization header to pass through to Supabase client
  const authHeader = req.headers.get("Authorization");
  
  // Create client with the user's JWT for RLS
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  try {
    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("[SGT-API] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, params = {} } = await req.json();
    console.log(`[SGT-API] Action: ${action}`, params);
    
    // Get the user's profile to find their SGT user ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("sgt_user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const userSgtId = profile?.sgt_user_id;
    
    let data;
    
    switch (action) {
      case "members": {
        // Only return member names (not emails) for authenticated users
        const { data: members, error } = await supabase
          .from("sgt_members")
          .select("user_id, user_name, user_country_code, user_has_avatar, user_active")
          .eq("user_active", 1)
          .order("user_name");
        
        if (error) throw error;
        
        data = { 
          members: members?.map(m => ({
            user_id: m.user_id,
            user_name: m.user_name,
            user_country_code: m.user_country_code,
            user_has_avatar: m.user_has_avatar,
            user_active: m.user_active,
          })) || []
        };
        break;
      }
        
      case "tours": {
        const { data: tours, error } = await supabase
          .from("sgt_tours")
          .select("*")
          .order("active", { ascending: false })
          .order("start_date", { ascending: false });
        
        if (error) throw error;
        
        data = tours?.map(t => ({
          tourId: t.tour_id,
          name: t.name,
          start_date: t.start_date,
          end_date: t.end_date,
          teamTour: t.team_tour,
          active: t.active,
        })) || [];
        break;
      }
        
      case "tour-standings": {
        if (!params.tourId) throw new Error("tourId required");
        
        const { data: standings, error } = await supabase
          .from("sgt_tour_standings")
          .select("*")
          .eq("tour_id", parseInt(params.tourId))
          .eq("gross_or_net", params.grossOrNet || "gross")
          .order("position");
        
        if (error) throw error;
        
        data = standings?.map(s => ({
          user_name: s.user_name,
          country_code: s.country_code,
          user_has_avatar: s.user_has_avatar,
          hcp: s.hcp,
          events: s.events,
          first: s.first,
          top5: s.top5,
          top10: s.top10,
          points: s.points,
          position: s.position,
        })) || [];
        break;
      }
        
      case "tour-members": {
        if (!params.tourId) throw new Error("tourId required");
        
        const { data: members, error } = await supabase
          .from("sgt_tour_members")
          .select("*")
          .eq("tour_id", parseInt(params.tourId));
        
        if (error) throw error;
        
        data = members?.map(m => ({
          user_id: m.user_id,
          user_name: m.user_name,
          hcp_index: m.hcp_index,
          custom_hcp: m.custom_hcp,
        })) || [];
        break;
      }
        
      case "tournaments": {
        if (!params.tourId) throw new Error("tourId required");
        
        const { data: tournaments, error } = await supabase
          .from("sgt_tournaments")
          .select("*")
          .eq("tour_id", parseInt(params.tourId))
          .order("start_date", { ascending: false });
        
        if (error) throw error;
        
        data = { 
          results: tournaments?.map(t => ({
            tournamentId: t.tournament_id,
            tourId: t.tour_id,
            name: t.name,
            courseName: t.course_name,
            status: t.status,
            start_date: t.start_date,
            end_date: t.end_date,
          })) || []
        };
        break;
      }
        
      case "scorecards": {
        if (!params.tournamentId) throw new Error("tournamentId required");
        
        // RLS will automatically filter to only show user's own scorecards
        const { data: scorecards, error } = await supabase
          .from("sgt_scorecards")
          .select("*")
          .eq("tournament_id", parseInt(params.tournamentId));
        
        if (error) throw error;
        
        data = scorecards?.map(sc => ({
          playerId: sc.player_id,
          player_name: sc.player_name,
          hcp_index: sc.hcp_index,
          round: sc.round,
          courseName: sc.course_name,
          teetype: sc.teetype,
          rating: sc.rating,
          slope: sc.slope,
          total_gross: sc.total_gross,
          total_net: sc.total_net,
          toPar_gross: sc.to_par_gross,
          toPar_net: sc.to_par_net,
          in_gross: sc.in_gross,
          out_gross: sc.out_gross,
          in_net: sc.in_net,
          out_net: sc.out_net,
          ...sc.hole_data,
        })) || [];
        break;
      }
        
      case "member-stats": {
        // Users can only get their own stats
        const userId = userSgtId;
        if (!userId) {
          data = { tours: [], handicap: null, totalRounds: 0, standing: null };
          break;
        }
        
        // Get user's SGT username from sgt_members
        const { data: sgtMember } = await supabase
          .from("sgt_members")
          .select("user_name")
          .eq("user_id", userId)
          .maybeSingle();
        
        const sgtUserName = sgtMember?.user_name;
        
        // Get tour memberships with handicap info
        const { data: tourMemberships, error: tmError } = await supabase
          .from("sgt_tour_members")
          .select("*, sgt_tours!inner(name, active, tour_id)")
          .eq("user_id", userId);
        
        if (tmError) throw tmError;
        
        const activeTourMemberships = tourMemberships?.filter(tm => tm.sgt_tours?.active === 1) || [];
        
        const tours = activeTourMemberships.map(tm => ({
          tourId: tm.tour_id,
          tourName: tm.sgt_tours?.name,
          handicap: tm.hcp_index || 0,
          customHandicap: tm.custom_hcp || 0,
        }));
        
        // Get user's standing in the active tour
        let standing = null;
        if (sgtUserName && activeTourMemberships.length > 0) {
          const activeTourId = activeTourMemberships[0].tour_id;
          const { data: standingData } = await supabase
            .from("sgt_tour_standings")
            .select("position, points, first, top5, top10, events")
            .eq("tour_id", activeTourId)
            .eq("user_name", sgtUserName)
            .eq("gross_or_net", "gross")
            .maybeSingle();
          
          if (standingData) {
            standing = {
              position: standingData.position,
              points: standingData.points,
              first: standingData.first,
              top5: standingData.top5,
              top10: standingData.top10,
              events: standingData.events,
            };
          }
        }
        
        data = {
          tours,
          handicap: tours.length > 0 ? tours[0].handicap : null,
          totalRounds: 0,
          standing,
        };
        break;
      }
        
      case "player-rounds": {
        // Users can only get their own rounds - RLS enforces this
        const userId = userSgtId;
        if (!userId) {
          data = [];
          break;
        }
        
        // RLS will filter to only show user's own scorecards
        const { data: scorecards, error } = await supabase
          .from("sgt_scorecards")
          .select("*, sgt_tournaments!inner(name, course_name, end_date, status)")
          .eq("player_id", userId)
          .limit(50);
        
        if (error) throw error;
        
        // Sort by tournament end_date descending (most recent first), then by round descending
        const sortedScorecards = (scorecards || []).sort((a, b) => {
          const dateA = new Date(a.sgt_tournaments?.end_date || 0).getTime();
          const dateB = new Date(b.sgt_tournaments?.end_date || 0).getTime();
          if (dateB !== dateA) return dateB - dateA;
          // If same date, sort by round descending
          return (b.round || 1) - (a.round || 1);
        });
        
        data = sortedScorecards.map(sc => ({
          tournamentId: sc.tournament_id,
          tournamentName: sc.sgt_tournaments?.name,
          courseName: sc.course_name || sc.sgt_tournaments?.course_name,
          date: sc.sgt_tournaments?.end_date,
          status: sc.sgt_tournaments?.status,
          scorecard: {
            playerId: sc.player_id,
            player_name: sc.player_name,
            hcp_index: sc.hcp_index,
            round: sc.round,
            courseName: sc.course_name,
            teetype: sc.teetype,
            rating: sc.rating,
            slope: sc.slope,
            total_gross: sc.total_gross,
            total_net: sc.total_net,
            toPar_gross: sc.to_par_gross,
            toPar_net: sc.to_par_net,
            in_gross: sc.in_gross,
            out_gross: sc.out_gross,
            in_net: sc.in_net,
            out_net: sc.out_net,
            holeData: sc.hole_data,
            ...sc.hole_data,
          },
        }));
        break;
      }
      
      case "tournament-results": {
        if (!params.tournamentId) throw new Error("tournamentId required");
        
        // Use service role to bypass RLS for public leaderboard data
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, serviceKey);
        
        // Get tournament status
        const { data: tournament } = await adminClient
          .from("sgt_tournaments")
          .select("status")
          .eq("tournament_id", parseInt(params.tournamentId))
          .single();
        
        const isCompleted = tournament?.status === "Completed";
        
        const { data: scorecards, error } = await adminClient
          .from("sgt_scorecards")
          .select("player_name, hcp_index, round, total_gross, total_net, to_par_gross, to_par_net, hole_data")
          .eq("tournament_id", parseInt(params.tournamentId))
          .order("round");
        
        if (error) throw error;
        
        // Helper to count completed holes
        const countHoles = (holeData: unknown, scoreType: "gross" | "net"): number => {
          if (!holeData || typeof holeData !== "object") return 0;
          const d = holeData as Record<string, unknown>;
          let count = 0;
          for (let h = 1; h <= 18; h++) {
            const val = d[`hole${h}_${scoreType}`];
            const num = typeof val === "number" ? val : Number(val);
            if (Number.isFinite(num) && num > 0) count++;
          }
          return count;
        };
        
        // Group scorecards by player
        const playerMap = new Map<string, {
          player_name: string;
          hcp: number;
          r1_gross: number | null;
          r1_net: number | null;
          r1_thru: number | null;
          r2_gross: number | null;
          r2_net: number | null;
          r2_thru: number | null;
          total_gross: number;
          total_net: number;
          to_par_gross: number;
          to_par_net: number;
          completedRounds: number;
        }>();
        
        const grossOrNet = (params.grossOrNet === "net" ? "net" : "gross") as "gross" | "net";
        
        for (const sc of scorecards || []) {
          const holesCompleted = countHoles(sc.hole_data, grossOrNet);
          const isRoundComplete = holesCompleted === 18;
          
          const existing = playerMap.get(sc.player_name) || {
            player_name: sc.player_name,
            hcp: sc.hcp_index,
            r1_gross: null,
            r1_net: null,
            r1_thru: null,
            r2_gross: null,
            r2_net: null,
            r2_thru: null,
            total_gross: 0,
            total_net: 0,
            to_par_gross: 0,
            to_par_net: 0,
            completedRounds: 0,
          };
          
          if (sc.round === 1) {
            existing.r1_gross = sc.total_gross;
            existing.r1_net = sc.total_net;
            existing.r1_thru = isRoundComplete ? null : (holesCompleted > 0 ? holesCompleted : null);
            if (isRoundComplete) existing.completedRounds++;
          } else if (sc.round === 2) {
            existing.r2_gross = sc.total_gross;
            existing.r2_net = sc.total_net;
            existing.r2_thru = isRoundComplete ? null : (holesCompleted > 0 ? holesCompleted : null);
            if (isRoundComplete) existing.completedRounds++;
          }
          
          existing.total_gross += sc.total_gross || 0;
          existing.total_net += sc.total_net || 0;
          existing.to_par_gross += sc.to_par_gross || 0;
          existing.to_par_net += sc.to_par_net || 0;
          
          playerMap.set(sc.player_name, existing);
        }
        
        // Determine max rounds in tournament
        const maxRound = Math.max(1, ...(scorecards?.map(s => s.round || 1) || [1]));
        
        // Sort by gross or net score
        const sortBy = params.grossOrNet === "net" ? "to_par_net" : "to_par_gross";
        const sorted = Array.from(playerMap.values())
          .map(p => ({
            ...p,
            dnf: isCompleted && p.completedRounds < maxRound,
          }))
          .sort((a, b) => {
            // DNFs at bottom
            if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
            return (a[sortBy] ?? 999) - (b[sortBy] ?? 999);
          });
        
        // Add positions
        data = sorted.map((player, index) => ({
          position: index + 1,
          ...player,
        }));
        break;
      }
        
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`[SGT-API] Response for ${action}: success`);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SGT-API] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
