import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

let cachedApiKey: string | null = null;
let apiKeyExpiry: number = 0;

async function getApiKey(): Promise<string> {
  const now = Date.now();
  
  if (cachedApiKey && apiKeyExpiry > now + 300000) {
    return cachedApiKey;
  }

  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  console.log("[SGT-SYNC] Requesting new API key...");
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const data = await response.json();

  if (!data.success || !data.key) {
    throw new Error("Failed to authenticate with SGT API");
  }

  cachedApiKey = data.key;
  apiKeyExpiry = now + (data.expires * 1000);
  
  console.log("[SGT-SYNC] API key obtained successfully");
  return cachedApiKey as string;
}

async function sgtRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-SYNC] Fetching: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data === "INVALID API KEY") {
    cachedApiKey = null;
    apiKeyExpiry = 0;
    throw new Error("Invalid API key");
  }

  return data;
}

function extractArray(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of keys) {
      if (key in data && Array.isArray((data as Record<string, unknown>)[key])) {
        return (data as Record<string, unknown>)[key] as unknown[];
      }
    }
  }
  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate sync secret
  const syncSecret = req.headers.get("x-sync-secret");
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  
  if (!expectedSecret || syncSecret !== expectedSecret) {
    console.error("[SGT-SYNC] Unauthorized sync attempt - invalid or missing secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let totalRecords = 0;

  try {
    console.log("[SGT-SYNC] Starting SGT data sync...");

    // 1. Sync Members
    console.log("[SGT-SYNC] Syncing members...");
    const membersResponse = await sgtRequest("/members/list");
    const members = extractArray(membersResponse, ['members', 'results']);
    
    for (const member of members) {
      const m = member as { user_id: number; user_name: string; user_email?: string; user_active?: number; user_country_code?: string; user_has_avatar?: string };
      await supabase.from("sgt_members").upsert({
        user_id: m.user_id,
        user_name: m.user_name,
        user_email: m.user_email,
        user_active: m.user_active ?? 1,
        user_country_code: m.user_country_code,
        user_has_avatar: m.user_has_avatar,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      totalRecords++;
    }
    console.log(`[SGT-SYNC] Synced ${members.length} members`);

    // 2. Sync Tours
    console.log("[SGT-SYNC] Syncing tours...");
    const toursResponse = await sgtRequest("/tours/list");
    const tours = extractArray(toursResponse, ['tours', 'results']);
    
    for (const tour of tours) {
      const t = tour as { tourId: number; name: string; start_date?: string; end_date?: string; teamTour?: number; active?: number };
      await supabase.from("sgt_tours").upsert({
        tour_id: t.tourId,
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
        team_tour: t.teamTour ?? 0,
        active: t.active ?? 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tour_id' });
      totalRecords++;
    }
    console.log(`[SGT-SYNC] Synced ${tours.length} tours`);

    // Get active tours for further syncing
    const activeTours = tours.filter((t: unknown) => (t as { active?: number }).active === 1);

    // 3. Sync Tour Standings and Members for active tours
    for (const tour of activeTours) {
      const t = tour as { tourId: number; name: string };
      console.log(`[SGT-SYNC] Syncing tour: ${t.name}`);

      // Standings (gross)
      try {
        const standingsResponse = await sgtRequest("/tours/standings", { tourId: t.tourId.toString(), grossOrNet: "gross" });
        const standings = extractArray(standingsResponse, ['standings', 'results']);
        
        for (const standing of standings) {
          const s = standing as { user_name: string; country_code?: string; user_has_avatar?: string; hcp?: number; events?: number; first?: number; top5?: number; top10?: number; points?: number; position?: number };
          await supabase.from("sgt_tour_standings").upsert({
            tour_id: t.tourId,
            user_name: s.user_name,
            country_code: s.country_code,
            user_has_avatar: s.user_has_avatar,
            hcp: s.hcp,
            events: s.events ?? 0,
            first: s.first ?? 0,
            top5: s.top5 ?? 0,
            top10: s.top10 ?? 0,
            points: s.points ?? 0,
            position: s.position,
            gross_or_net: "gross",
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tour_id,user_name,gross_or_net' });
          totalRecords++;
        }
        console.log(`[SGT-SYNC] Synced ${standings.length} gross standings for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing gross standings for tour ${t.tourId}:`, e);
      }

      // Standings (net)
      try {
        const standingsNetResponse = await sgtRequest("/tours/standings", { tourId: t.tourId.toString(), grossOrNet: "net" });
        const standingsNet = extractArray(standingsNetResponse, ['standings', 'results']);
        
        for (const standing of standingsNet) {
          const s = standing as { user_name: string; country_code?: string; user_has_avatar?: string; hcp?: number; events?: number; first?: number; top5?: number; top10?: number; points?: number; position?: number };
          await supabase.from("sgt_tour_standings").upsert({
            tour_id: t.tourId,
            user_name: s.user_name,
            country_code: s.country_code,
            user_has_avatar: s.user_has_avatar,
            hcp: s.hcp,
            events: s.events ?? 0,
            first: s.first ?? 0,
            top5: s.top5 ?? 0,
            top10: s.top10 ?? 0,
            points: s.points ?? 0,
            position: s.position,
            gross_or_net: "net",
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tour_id,user_name,gross_or_net' });
          totalRecords++;
        }
        console.log(`[SGT-SYNC] Synced ${standingsNet.length} net standings for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing net standings for tour ${t.tourId}:`, e);
      }

      // Tour Members
      try {
        const tourMembersResponse = await sgtRequest("/tours/members", { tourId: t.tourId.toString() });
        const tourMembers = extractArray(tourMembersResponse, ['members', 'results']);
        
        for (const member of tourMembers) {
          const m = member as { user_id: number; user_name: string; hcp_index?: number; custom_hcp?: number };
          await supabase.from("sgt_tour_members").upsert({
            tour_id: t.tourId,
            user_id: m.user_id,
            user_name: m.user_name,
            hcp_index: m.hcp_index,
            custom_hcp: m.custom_hcp,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tour_id,user_id' });
          totalRecords++;
        }
        console.log(`[SGT-SYNC] Synced ${tourMembers.length} members for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing members for tour ${t.tourId}:`, e);
      }

      // 4. Sync Tournaments for this tour
      try {
        const tournamentsResponse = await sgtRequest("/tournaments/list", { tourId: t.tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']);
        
        for (const tournament of tournaments.slice(0, 20)) { // Limit to recent 20 tournaments
          const tourn = tournament as { tournamentId: number; name: string; courseName?: string; status?: string; start_date?: string; end_date?: string };
          
          await supabase.from("sgt_tournaments").upsert({
            tournament_id: tourn.tournamentId,
            tour_id: t.tourId,
            name: tourn.name,
            course_name: tourn.courseName,
            status: tourn.status,
            start_date: tourn.start_date,
            end_date: tourn.end_date,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tournament_id' });
          totalRecords++;

          // 5. Sync Scorecards for this tournament
          try {
            const scorecardsResponse = await sgtRequest("/tournaments/scorecards", { tournamentId: tourn.tournamentId.toString() });
            const scorecards = extractArray(scorecardsResponse, ['scorecards', 'results']);
            
            for (const scorecard of scorecards) {
              const sc = scorecard as Record<string, unknown>;
              
              // Extract ALL hole-related fields (h1_Par, h1_index, hole1_gross, hole1_net, etc.)
              const holeData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(sc)) {
                // Capture h*_Par, h*_index, hole*_gross, hole*_net patterns
                if (/^h\d+/.test(key) || /^hole\d+/.test(key)) {
                  holeData[key] = value;
                }
              }

              await supabase.from("sgt_scorecards").upsert({
                tournament_id: tourn.tournamentId,
                player_id: sc.playerId as number,
                player_name: sc.player_name as string,
                hcp_index: sc.hcp_index as number,
                round: (sc.round as number) ?? 1,
                course_name: sc.courseName as string,
                teetype: sc.teetype as string,
                rating: sc.rating as number,
                slope: sc.slope as number,
                total_gross: sc.total_gross as number,
                total_net: sc.total_net as number,
                to_par_gross: sc.toPar_gross as number,
                to_par_net: sc.toPar_net as number,
                in_gross: sc.in_gross as number,
                out_gross: sc.out_gross as number,
                in_net: sc.in_net as number,
                out_net: sc.out_net as number,
                hole_data: holeData,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'tournament_id,player_id,round' });
              totalRecords++;
            }
            console.log(`[SGT-SYNC] Synced ${scorecards.length} scorecards for tournament ${tourn.tournamentId}`);
          } catch (e) {
            console.error(`[SGT-SYNC] Error syncing scorecards for tournament ${tourn.tournamentId}:`, e);
          }
        }
        console.log(`[SGT-SYNC] Synced ${tournaments.length} tournaments for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing tournaments for tour ${t.tourId}:`, e);
      }
    }

    console.log(`[SGT-SYNC] Sync completed! ${totalRecords} records synced.`);

    return new Response(
      JSON.stringify({ success: true, records: totalRecords }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-SYNC] Sync error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
