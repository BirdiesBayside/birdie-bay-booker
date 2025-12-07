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

  const authHeader = req.headers.get("Authorization");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, params = {} } = await req.json();
    console.log(`SGT API action: ${action}`, params);

    const { data: profile } = await supabase
      .from("profiles")
      .select("sgt_user_id, display_name")
      .eq("user_id", user.id)
      .single();

    const userSgtId = profile?.sgt_user_id;

    let data;

    switch (action) {
      case "members": {
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
          .order("active", { ascending: false });

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
          .order("end_date", { ascending: false });

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
          holeData: sc.hole_data,
        })) || [];
        break;
      }

      case "member-stats": {
        const userId = userSgtId;
        if (!userId) {
          data = { tours: [], handicap: null, totalRounds: 0, standing: null };
          break;
        }

        const { data: sgtMember } = await supabase
          .from("sgt_members")
          .select("user_name")
          .eq("user_id", userId)
          .single();

        const sgtUserName = sgtMember?.user_name;

        const { data: tourMemberships, error: tmError } = await supabase
          .from("sgt_tour_members")
          .select("*")
          .eq("user_id", userId);

        if (tmError) throw tmError;

        // Get active tours
        const { data: activeTours } = await supabase
          .from("sgt_tours")
          .select("tour_id, name")
          .eq("active", 1);

        const activeTourIds = new Set(activeTours?.map(t => t.tour_id) || []);
        const activeTourMemberships = tourMemberships?.filter(tm => activeTourIds.has(tm.tour_id)) || [];

        const tours = activeTourMemberships.map(tm => {
          const tour = activeTours?.find(t => t.tour_id === tm.tour_id);
          return {
            tourId: tm.tour_id,
            tourName: tour?.name,
            handicap: tm.hcp_index || 0,
            customHandicap: tm.custom_hcp || 0,
          };
        });

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
        const userId = userSgtId;
        if (!userId) {
          data = [];
          break;
        }

        const { data: scorecards, error } = await supabase
          .from("sgt_scorecards")
          .select("*")
          .eq("player_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        // Get tournament info for each scorecard
        const tournamentIds = [...new Set(scorecards?.map(sc => sc.tournament_id) || [])];
        const { data: tournaments } = await supabase
          .from("sgt_tournaments")
          .select("*")
          .in("tournament_id", tournamentIds);

        const tournamentMap = new Map(tournaments?.map(t => [t.tournament_id, t]) || []);

        data = scorecards?.map(sc => {
          const tournament = tournamentMap.get(sc.tournament_id);
          return {
            tournamentId: sc.tournament_id,
            tournamentName: tournament?.name,
            courseName: sc.course_name || tournament?.course_name,
            date: tournament?.end_date,
            status: tournament?.status,
            scorecard: {
              tournamentId: sc.tournament_id,
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
            },
          };
        }) || [];
        break;
      }

      case "tournament-results": {
        if (!params.tournamentId) throw new Error("tournamentId required");

        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const adminClient = createClient(supabaseUrl, serviceKey);

        const { data: scorecards, error } = await adminClient
          .from("sgt_scorecards")
          .select("player_name, hcp_index, round, total_gross, total_net, to_par_gross, to_par_net")
          .eq("tournament_id", parseInt(params.tournamentId))
          .order("round");

        if (error) throw error;

        const playerMap = new Map<string, {
          player_name: string;
          hcp: number;
          r1_gross: number | null;
          r1_net: number | null;
          r2_gross: number | null;
          r2_net: number | null;
          total_gross: number;
          total_net: number;
          to_par_gross: number;
          to_par_net: number;
        }>();

        for (const sc of scorecards || []) {
          const existing = playerMap.get(sc.player_name) || {
            player_name: sc.player_name,
            hcp: sc.hcp_index,
            r1_gross: null,
            r1_net: null,
            r2_gross: null,
            r2_net: null,
            total_gross: 0,
            total_net: 0,
            to_par_gross: 0,
            to_par_net: 0,
          };

          if (sc.round === 1) {
            existing.r1_gross = sc.total_gross;
            existing.r1_net = sc.total_net;
          } else if (sc.round === 2) {
            existing.r2_gross = sc.total_gross;
            existing.r2_net = sc.total_net;
          }

          existing.total_gross += sc.total_gross || 0;
          existing.total_net += sc.total_net || 0;
          existing.to_par_gross += sc.to_par_gross || 0;
          existing.to_par_net += sc.to_par_net || 0;

          playerMap.set(sc.player_name, existing);
        }

        const sortBy = params.grossOrNet === "net" ? "to_par_net" : "to_par_gross";
        const sorted = Array.from(playerMap.values()).sort((a, b) => {
          return (a[sortBy as keyof typeof a] as number ?? 999) - (b[sortBy as keyof typeof b] as number ?? 999);
        });

        data = sorted.map((player, index) => ({
          position: index + 1,
          ...player,
        }));
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    console.log(`SGT API response for ${action}:`, typeof data === 'object' ? 'success' : data);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("SGT API error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
