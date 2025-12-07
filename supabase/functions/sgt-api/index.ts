import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";

interface SgtApiConfig {
  api_key: string;
  expires_at: string;
}

// Get or create/refresh SGT API key
// deno-lint-ignore no-explicit-any
async function getSgtApiKey(adminClient: any): Promise<string> {
  const clubUrl = Deno.env.get("SGT_CLUB_URL");
  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!clubUrl || !username || !password) {
    throw new Error("SGT credentials not configured");
  }

  // Check if we have a valid API key stored
  const { data: config } = await adminClient
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .limit(1)
    .maybeSingle() as { data: SgtApiConfig | null };

  const now = new Date();
  const bufferMinutes = 30; // Refresh 30 minutes before expiry

  if (config) {
    const expiresAt = new Date(config.expires_at);
    const bufferTime = new Date(expiresAt.getTime() - bufferMinutes * 60 * 1000);

    if (now < bufferTime) {
      console.log("[SGT-API] Using cached API key, expires:", expiresAt.toISOString());
      return config.api_key;
    }

    // Try to refresh existing key
    console.log("[SGT-API] Attempting to refresh API key...");
    try {
      const refreshed = await refreshApiKey(clubUrl, config.api_key);
      if (refreshed) {
        await saveApiKey(adminClient, refreshed.key, refreshed.expires);
        console.log("[SGT-API] Successfully refreshed API key");
        return refreshed.key;
      }
    } catch (e) {
      console.log("[SGT-API] Refresh failed, will create new key:", e);
    }
  }

  // Create new API key
  console.log("[SGT-API] Creating new API key...");
  const created = await createApiKey(clubUrl, username, password);
  await saveApiKey(adminClient, created.key, created.expires);
  console.log("[SGT-API] Successfully created new API key");
  return created.key;
}

async function createApiKey(clubUrl: string, username: string, password: string): Promise<{ key: string; expires: number }> {
  const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[SGT-API] Create API key failed:", response.status, text);
    throw new Error(`Failed to create SGT API key: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success || !data.key) {
    throw new Error("SGT API key creation failed: " + JSON.stringify(data));
  }

  return { key: data.key, expires: data.expires || 86400 };
}

async function refreshApiKey(clubUrl: string, apiKey: string): Promise<{ key: string; expires: number } | null> {
  const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `api-key=${encodeURIComponent(apiKey)}`,
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  if (!data.success || !data.key) {
    return null;
  }

  return { key: data.key, expires: data.expires || 86400 };
}

// deno-lint-ignore no-explicit-any
async function saveApiKey(adminClient: any, key: string, expiresSeconds: number): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresSeconds * 1000);

  // Delete existing and insert new
  await adminClient.from("sgt_api_config").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await adminClient.from("sgt_api_config").insert({
    api_key: key,
    expires_at: expiresAt.toISOString(),
  });
}

// deno-lint-ignore no-explicit-any
async function ensureBaseDataSynced(adminClient: any, apiKey: string, clubUrl: string): Promise<void> {
  // Check if we have any members synced
  const { count: memberCount } = await adminClient
    .from("sgt_members")
    .select("*", { count: "exact", head: true });

  if (!memberCount || memberCount === 0) {
    console.log("[SGT-API] No members cached, syncing from API...");
    try {
      const sgtData = await sgtApiRequest(apiKey, clubUrl, "members") as { members?: Array<Record<string, unknown>> };
      if (sgtData.members) {
        for (const member of sgtData.members) {
          await adminClient
            .from("sgt_members")
            .upsert({
              user_id: member.user_id,
              user_name: member.user_name,
              user_email: member.user_email || null,
              user_country_code: member.user_country_code || null,
              user_has_avatar: member.user_has_avatar || null,
              user_active: member.user_active ?? 1,
            }, { onConflict: "user_id" });
        }
        console.log(`[SGT-API] Synced ${sgtData.members.length} members`);
      }
    } catch (e) {
      console.log("[SGT-API] Failed to sync members:", e);
    }
  }

  // Check if we have any tours synced
  const { count: tourCount } = await adminClient
    .from("sgt_tours")
    .select("*", { count: "exact", head: true });

  if (!tourCount || tourCount === 0) {
    console.log("[SGT-API] No tours cached, syncing from API...");
    try {
      const sgtData = await sgtApiRequest(apiKey, clubUrl, "tours") as Array<Record<string, unknown>>;
      for (const tour of sgtData) {
        await adminClient
          .from("sgt_tours")
          .upsert({
            tour_id: tour.tourId,
            name: tour.name,
            start_date: tour.start_date || null,
            end_date: tour.end_date || null,
            team_tour: tour.teamTour ?? 0,
            active: tour.active ?? 1,
          }, { onConflict: "tour_id" });
      }
      console.log(`[SGT-API] Synced ${sgtData.length} tours`);

      // Also sync tour members and standings for active tours
      const activeTours = sgtData.filter(t => t.active === 1);
      for (const tour of activeTours) {
        try {
          // Sync tour members
          const tourMembers = await sgtApiRequest(apiKey, clubUrl, `tour/${tour.tourId}/members`) as Array<Record<string, unknown>>;
          for (const member of tourMembers) {
            await adminClient
              .from("sgt_tour_members")
              .upsert({
                tour_id: tour.tourId,
                user_id: member.user_id,
                user_name: member.user_name || null,
                hcp_index: member.hcp_index ?? null,
                custom_hcp: member.custom_hcp ?? null,
              }, { onConflict: "tour_id,user_id" });
          }
          console.log(`[SGT-API] Synced ${tourMembers.length} tour members for tour ${tour.tourId}`);

          // Sync tour standings
          const standings = await sgtApiRequest(apiKey, clubUrl, `tour/${tour.tourId}/standings`, { grossOrNet: "gross" }) as Array<Record<string, unknown>>;
          for (const standing of standings) {
            await adminClient
              .from("sgt_tour_standings")
              .upsert({
                tour_id: tour.tourId,
                user_name: standing.user_name,
                gross_or_net: "gross",
                position: standing.position,
                hcp: standing.hcp,
                events: standing.events ?? 0,
                first: standing.first ?? 0,
                top5: standing.top5 ?? 0,
                top10: standing.top10 ?? 0,
                points: standing.points ?? 0,
                country_code: standing.country_code || null,
                user_has_avatar: standing.user_has_avatar || null,
              }, { onConflict: "tour_id,user_name,gross_or_net" });
          }
          console.log(`[SGT-API] Synced ${standings.length} standings for tour ${tour.tourId}`);
        } catch (e) {
          console.log(`[SGT-API] Failed to sync tour ${tour.tourId} details:`, e);
        }
      }
    } catch (e) {
      console.log("[SGT-API] Failed to sync tours:", e);
    }
  }
}

// Make authenticated request to SGT API
async function sgtApiRequest(apiKey: string, clubUrl: string, endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(`${SGT_BASE_URL}/${clubUrl}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[SGT-API] Request to ${endpoint} failed:`, response.status, text);
    throw new Error(`SGT API request failed: ${response.status}`);
  }

  return response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clubUrl = Deno.env.get("SGT_CLUB_URL")!;

  const authHeader = req.headers.get("Authorization");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("sgt_user_id, display_name, email")
      .eq("user_id", user.id)
      .single();

    let userSgtId = profile?.sgt_user_id;

    // Get valid API key (auto-creates/refreshes as needed)
    const apiKey = await getSgtApiKey(adminClient);

    // Ensure base data is synced before processing any action
    await ensureBaseDataSynced(adminClient, apiKey, clubUrl);

    // Auto-link user by email if sgt_user_id is not set
    if (!userSgtId && profile?.email) {
      const { data: sgtMember } = await adminClient
        .from("sgt_members")
        .select("user_id")
        .eq("user_email", profile.email)
        .maybeSingle();

      if (sgtMember?.user_id) {
        console.log(`[SGT-API] Auto-linking user by email: ${profile.email} -> SGT ID ${sgtMember.user_id}`);
        // Update the profile with the SGT user ID
        await adminClient
          .from("profiles")
          .update({ sgt_user_id: sgtMember.user_id })
          .eq("user_id", user.id);
        userSgtId = sgtMember.user_id;
      }
    }

    let data;

    switch (action) {
      case "members": {
        // First try to get from SGT API and sync to database
        try {
          const sgtData = await sgtApiRequest(apiKey, clubUrl, "members") as { members?: Array<Record<string, unknown>> };
          if (sgtData.members) {
            // Sync members to database
            for (const member of sgtData.members) {
              await adminClient
                .from("sgt_members")
                .upsert({
                  user_id: member.user_id,
                  user_name: member.user_name,
                  user_country_code: member.user_country_code || null,
                  user_has_avatar: member.user_has_avatar || null,
                  user_active: member.user_active ?? 1,
                }, { onConflict: "user_id" });
            }
          }
          data = sgtData;
        } catch (e) {
          console.log("[SGT-API] Falling back to cached members:", e);
          const { data: members } = await adminClient
            .from("sgt_members")
            .select("user_id, user_name, user_country_code, user_has_avatar, user_active")
            .eq("user_active", 1)
            .order("user_name");
          data = { members: members || [] };
        }
        break;
      }

      case "tours": {
        try {
          const sgtData = await sgtApiRequest(apiKey, clubUrl, "tours") as Array<Record<string, unknown>>;
          // Sync tours to database
          for (const tour of sgtData) {
            await adminClient
              .from("sgt_tours")
              .upsert({
                tour_id: tour.tourId,
                name: tour.name,
                start_date: tour.start_date || null,
                end_date: tour.end_date || null,
                team_tour: tour.teamTour ?? 0,
                active: tour.active ?? 1,
              }, { onConflict: "tour_id" });
          }
          data = sgtData;
        } catch (e) {
          console.log("[SGT-API] Falling back to cached tours:", e);
          const { data: tours } = await adminClient
            .from("sgt_tours")
            .select("*")
            .order("active", { ascending: false });
          data = tours?.map(t => ({
            tourId: t.tour_id,
            name: t.name,
            start_date: t.start_date,
            end_date: t.end_date,
            teamTour: t.team_tour,
            active: t.active,
          })) || [];
        }
        break;
      }

      case "tour-standings": {
        if (!params.tourId) throw new Error("tourId required");
        const grossOrNet = params.grossOrNet || "gross";

        try {
          const sgtData = await sgtApiRequest(apiKey, clubUrl, `tour/${params.tourId}/standings`, { grossOrNet }) as Array<Record<string, unknown>>;
          // Sync standings to database
          for (const standing of sgtData) {
            await adminClient
              .from("sgt_tour_standings")
              .upsert({
                tour_id: parseInt(params.tourId),
                user_name: standing.user_name,
                gross_or_net: grossOrNet,
                position: standing.position,
                hcp: standing.hcp,
                events: standing.events ?? 0,
                first: standing.first ?? 0,
                top5: standing.top5 ?? 0,
                top10: standing.top10 ?? 0,
                points: standing.points ?? 0,
                country_code: standing.country_code || null,
                user_has_avatar: standing.user_has_avatar || null,
              }, { onConflict: "tour_id,user_name,gross_or_net" });
          }
          data = sgtData;
        } catch (e) {
          console.log("[SGT-API] Falling back to cached standings:", e);
          const { data: standings } = await adminClient
            .from("sgt_tour_standings")
            .select("*")
            .eq("tour_id", parseInt(params.tourId))
            .eq("gross_or_net", grossOrNet)
            .order("position");
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
        }
        break;
      }

      case "tour-members": {
        if (!params.tourId) throw new Error("tourId required");

        try {
          const sgtData = await sgtApiRequest(apiKey, clubUrl, `tour/${params.tourId}/members`) as Array<Record<string, unknown>>;
          // Sync tour members to database
          for (const member of sgtData) {
            await adminClient
              .from("sgt_tour_members")
              .upsert({
                tour_id: parseInt(params.tourId),
                user_id: member.user_id,
                user_name: member.user_name || null,
                hcp_index: member.hcp_index ?? null,
                custom_hcp: member.custom_hcp ?? null,
              }, { onConflict: "tour_id,user_id" });
          }
          data = sgtData;
        } catch (e) {
          console.log("[SGT-API] Falling back to cached tour members:", e);
          const { data: members } = await adminClient
            .from("sgt_tour_members")
            .select("*")
            .eq("tour_id", parseInt(params.tourId));
          data = members?.map(m => ({
            user_id: m.user_id,
            user_name: m.user_name,
            hcp_index: m.hcp_index,
            custom_hcp: m.custom_hcp,
          })) || [];
        }
        break;
      }

      case "tournaments": {
        if (!params.tourId) throw new Error("tourId required");

        try {
          const sgtData = await sgtApiRequest(apiKey, clubUrl, `tour/${params.tourId}/tournaments`) as { results?: Array<Record<string, unknown>> };
          if (sgtData.results) {
            for (const tournament of sgtData.results) {
              await adminClient
                .from("sgt_tournaments")
                .upsert({
                  tournament_id: tournament.tournamentId,
                  tour_id: parseInt(params.tourId),
                  name: tournament.name,
                  course_name: tournament.courseName || null,
                  status: tournament.status || "Upcoming",
                  start_date: tournament.start_date || null,
                  end_date: tournament.end_date || null,
                }, { onConflict: "tournament_id" });
            }
          }
          data = sgtData;
        } catch (e) {
          console.log("[SGT-API] Falling back to cached tournaments:", e);
          const { data: tournaments } = await adminClient
            .from("sgt_tournaments")
            .select("*")
            .eq("tour_id", parseInt(params.tourId))
            .order("end_date", { ascending: false });
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
        }
        break;
      }

      case "scorecards": {
        if (!params.tournamentId) throw new Error("tournamentId required");

        try {
          const sgtData = await sgtApiRequest(apiKey, clubUrl, `tournament/${params.tournamentId}/scorecards`) as Array<Record<string, unknown>>;
          for (const sc of sgtData) {
            await adminClient
              .from("sgt_scorecards")
              .upsert({
                tournament_id: parseInt(params.tournamentId),
                player_id: sc.playerId,
                player_name: sc.player_name,
                round: sc.round ?? 1,
                hcp_index: sc.hcp_index ?? null,
                course_name: sc.courseName || null,
                teetype: sc.teetype || null,
                rating: sc.rating ?? null,
                slope: sc.slope ?? null,
                total_gross: sc.total_gross ?? null,
                total_net: sc.total_net ?? null,
                to_par_gross: sc.toPar_gross ?? null,
                to_par_net: sc.toPar_net ?? null,
                in_gross: sc.in_gross ?? null,
                out_gross: sc.out_gross ?? null,
                in_net: sc.in_net ?? null,
                out_net: sc.out_net ?? null,
                hole_data: sc.holeData ?? null,
              }, { onConflict: "tournament_id,player_id,round" });
          }
          data = sgtData;
        } catch (e) {
          console.log("[SGT-API] Falling back to cached scorecards:", e);
          const { data: scorecards } = await adminClient
            .from("sgt_scorecards")
            .select("*")
            .eq("tournament_id", parseInt(params.tournamentId));
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
        }
        break;
      }

      case "member-stats": {
        const userId = userSgtId;
        if (!userId) {
          data = { tours: [], handicap: null, totalRounds: 0, standing: null };
          break;
        }

        // Get user's tour memberships
        const { data: tourMemberships } = await adminClient
          .from("sgt_tour_members")
          .select("*")
          .eq("user_id", userId);

        // Get active tours
        const { data: activeTours } = await adminClient
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

        // Get user's standing
        const { data: sgtMember } = await adminClient
          .from("sgt_members")
          .select("user_name")
          .eq("user_id", userId)
          .maybeSingle();

        let standing = null;
        if (sgtMember?.user_name && activeTourMemberships.length > 0) {
          const activeTourId = activeTourMemberships[0].tour_id;
          const { data: standingData } = await adminClient
            .from("sgt_tour_standings")
            .select("position, points, first, top5, top10, events")
            .eq("tour_id", activeTourId)
            .eq("user_name", sgtMember.user_name)
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

        // Count total rounds
        const { count: totalRounds } = await adminClient
          .from("sgt_scorecards")
          .select("*", { count: "exact", head: true })
          .eq("player_id", userId);

        data = {
          tours,
          handicap: tours.length > 0 ? tours[0].handicap : null,
          totalRounds: totalRounds || 0,
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

        const { data: scorecards } = await adminClient
          .from("sgt_scorecards")
          .select("*")
          .eq("player_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        const tournamentIds = [...new Set(scorecards?.map(sc => sc.tournament_id) || [])];
        const { data: tournaments } = await adminClient
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

        const { data: scorecards } = await adminClient
          .from("sgt_scorecards")
          .select("player_name, hcp_index, round, total_gross, total_net, to_par_gross, to_par_net")
          .eq("tournament_id", parseInt(params.tournamentId))
          .order("round");

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