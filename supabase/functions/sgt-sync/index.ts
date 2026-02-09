import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

// Get API key - READ-ONLY from database
// New keys are only created by the daily sgt-refresh-api-key cron job at 4am
async function getApiKey(supabase: unknown): Promise<string> {
  const client = supabase as ReturnType<typeof createClient>;
  const { data: configData } = await client
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const config = configData as { api_key: string; expires_at: string } | null;
  
  if (!config?.api_key) {
    throw new Error("No API key found in database - run sgt-refresh-api-key first");
  }

  const expiresAt = new Date(config.expires_at);
  const timeUntilExpiry = expiresAt.getTime() - Date.now();
  
  if (timeUntilExpiry <= 0) {
    throw new Error("API key has expired - wait for 4am cron refresh or manually trigger sgt-refresh-api-key");
  }

  console.log(`[SGT-SYNC] Using cached API key, expires in ${Math.round(timeUntilExpiry / 60000)}m`);
  return config.api_key;
}

async function sgtRequest(endpoint: string, apiKey: string, params: Record<string, string> = {}): Promise<unknown> {
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
    throw new Error("Invalid API key");
  }

  return data;
}

async function sgtPostRequest(endpoint: string, apiKey: string, body: Record<string, string | number>): Promise<unknown> {
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, value.toString());
  }

  console.log(`[SGT-SYNC] POST: ${endpoint}`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SGT API error: ${response.status} - ${text}`);
  }

  return response.json();
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
          console.log(`[SGT-SYNC] Triggered by admin user: ${user.email}`);
        }
      }
    }
  }
  
  if (!authorized) {
    console.error("[SGT-SYNC] Unauthorized sync attempt");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let totalRecords = 0;

  try {
    console.log("[SGT-SYNC] Starting SGT data sync (READ-ONLY - no cleanup)...");
    
    // Get API key once and reuse for all requests
    const apiKey = await getApiKey(supabase);

    // 1. Sync Members
    console.log("[SGT-SYNC] Syncing members...");
    const membersResponse = await sgtRequest("/members/list", apiKey);
    const members = extractArray(membersResponse, ['members', 'results']);
    
    for (const member of members) {
      const m = member as { user_id: number; user_name: string; user_email?: string; user_active?: number; user_country_code?: string; user_has_avatar?: string; user_game_id?: string };
      
      await supabase.from("sgt_members").upsert({
        user_id: m.user_id,
        user_name: m.user_name,
        user_email: m.user_email,
        user_active: m.user_active ?? 1,
        user_country_code: m.user_country_code,
        user_has_avatar: m.user_has_avatar,
        user_game_id: m.user_game_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      totalRecords++;
    }
    console.log(`[SGT-SYNC] Synced ${members.length} members`);

    // 2. Sync Tours
    console.log("[SGT-SYNC] Syncing tours...");
    const toursResponse = await sgtRequest("/tours/list", apiKey);
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

    // 3. Sync data for active tours only
    const activeTours = tours.filter((t: unknown) => (t as { active?: number }).active === 1);

    for (const tour of activeTours) {
      const t = tour as { tourId: number; name: string };
      console.log(`[SGT-SYNC] Syncing tour: ${t.name}`);

      // Standings (gross)
      try {
        const standingsResponse = await sgtRequest("/tours/standings", apiKey, { tourId: t.tourId.toString(), grossOrNet: "gross" });
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
        console.log(`[SGT-SYNC] Synced ${standings.length} gross standings`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing gross standings:`, e);
      }

      // Standings (net)
      try {
        const standingsNetResponse = await sgtRequest("/tours/standings", apiKey, { tourId: t.tourId.toString(), grossOrNet: "net" });
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
        console.log(`[SGT-SYNC] Synced ${standingsNet.length} net standings`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing net standings:`, e);
      }

      // Tour Members - only update existing local members
      try {
        const tourMembersResponse = await sgtRequest("/tours/members", apiKey, { tourId: t.tourId.toString() });
        const tourMembers = extractArray(tourMembersResponse, ['members', 'results']);
        
        const { data: existingLocalTourMembers } = await supabase
          .from("sgt_tour_members")
          .select("user_id")
          .eq("tour_id", t.tourId);
        
        const localTourMemberIds = new Set((existingLocalTourMembers || []).map(m => m.user_id));
        
        let syncedCount = 0;
        for (const member of tourMembers) {
          const m = member as { user_id: number; user_name: string; hcp_index?: number };
          
          if (localTourMemberIds.has(m.user_id)) {
            await supabase.from("sgt_tour_members").upsert({
              tour_id: t.tourId,
              user_id: m.user_id,
              user_name: m.user_name,
              hcp_index: m.hcp_index,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'tour_id,user_id' });
            syncedCount++;
            totalRecords++;
          }
        }
        console.log(`[SGT-SYNC] Synced ${syncedCount} tour members`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing tour members:`, e);
      }

      // Tournaments
      try {
        const tournamentsResponse = await sgtRequest("/tournaments/list", apiKey, { tourId: t.tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']);
        
        for (const tournament of tournaments.slice(0, 20)) {
          const tourn = tournament as { tournamentId: number; name: string; courseName?: string; status?: string; start_date?: string; end_date?: string };
          
          // Get today's date in Brisbane timezone for accurate comparison
          const now = new Date();
          const brisbaneTime = new Date(now.getTime() + 10 * 60 * 60 * 1000);
          const todayStr = brisbaneTime.toISOString().split('T')[0];
          
          let status = tourn.status;
          
          // AUTO-CLOSE: If tournament is "In Progress" and end_date has passed (inclusive), close it via API
          if ((status === 'In Progress' || status === 'Active') && tourn.end_date && tourn.end_date <= todayStr) {
            console.log(`[SGT-SYNC] Auto-closing tournament ${tourn.tournamentId} (${tourn.name}): end_date ${tourn.end_date} has passed`);
            try {
              const closeResult = await sgtPostRequest("/tournaments/close", apiKey, {
                tournamentId: tourn.tournamentId,
                assess_points: 1, // ALWAYS award tour standings points
              });
              console.log(`[SGT-SYNC] Tournament ${tourn.tournamentId} closed successfully:`, closeResult);
              status = 'Completed';
            } catch (closeError) {
              console.error(`[SGT-SYNC] Failed to close tournament ${tourn.tournamentId}:`, closeError);
              // Still mark as Completed in local DB even if API fails
              status = 'Completed';
            }
          }
          
          await supabase.from("sgt_tournaments").upsert({
            tournament_id: tourn.tournamentId,
            tour_id: t.tourId,
            name: tourn.name,
            course_name: tourn.courseName,
            status: status,
            start_date: tourn.start_date,
            end_date: tourn.end_date,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tournament_id' });
          totalRecords++;

          // Sync Scorecards - for ALL tournaments (completed and in-progress)
          // This ensures customers can see their rounds in the Hub immediately
          try {
            const scorecardsResponse = await sgtRequest("/tournaments/scorecards", apiKey, { tournamentId: tourn.tournamentId.toString() });
            const scorecards = extractArray(scorecardsResponse, ['scorecards', 'results']);
            
            // Track player IDs from this tournament for handicap refresh (only for completed)
            const playerIdsInTournament = new Set<number>();
            
            for (const scorecard of scorecards) {
              const sc = scorecard as Record<string, unknown>;
              const playerId = sc.playerId as number;
              const round = (sc.round as number) ?? 1;
              
              if (status === 'Completed') {
                playerIdsInTournament.add(playerId);
              }
              
              const holeData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(sc)) {
                if (/^h\d+/.test(key) || /^hole\d+/.test(key)) {
                  holeData[key] = value;
                }
              }

              await supabase.from("sgt_scorecards").upsert({
                tournament_id: tourn.tournamentId,
                player_id: playerId,
                player_name: sc.player_name as string,
                hcp_index: sc.hcp_index as number,
                round: round,
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
            console.log(`[SGT-SYNC] Synced ${scorecards.length} scorecards for ${status} tournament`);
            
            // After syncing completed tournament scorecards, refresh handicaps for participating players
            // This ensures handicaps update immediately when a round completes
            if (status === 'Completed' && playerIdsInTournament.size > 0) {
              try {
                const tourMembersResponse = await sgtRequest("/tours/members", apiKey, { tourId: t.tourId.toString() });
                const allTourMembers = extractArray(tourMembersResponse, ['members', 'results']);
                
                let handicapsUpdated = 0;
                for (const member of allTourMembers) {
                  const m = member as { user_id: number; user_name: string; hcp_index?: number };
                  
                  // Only update handicaps for players who participated in this tournament
                  if (playerIdsInTournament.has(m.user_id)) {
                    const { error: updateError } = await supabase
                      .from("sgt_tour_members")
                      .update({ 
                        hcp_index: m.hcp_index,
                        updated_at: new Date().toISOString()
                      })
                      .eq("tour_id", t.tourId)
                      .eq("user_id", m.user_id);
                    
                    if (!updateError) {
                      handicapsUpdated++;
                    }
                  }
                }
                console.log(`[SGT-SYNC] Refreshed handicaps for ${handicapsUpdated} players in completed tournament`);
              } catch (e) {
                console.error(`[SGT-SYNC] Error refreshing handicaps post-scorecard sync:`, e);
              }
            }
          } catch (e) {
            console.error(`[SGT-SYNC] Error syncing scorecards for tournament ${tourn.tournamentId}:`, e);
          }
        }
      console.log(`[SGT-SYNC] Synced ${Math.min(tournaments.length, 20)} tournaments`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing tournaments:`, e);
      }
    }

    // After syncing all data, trigger monthly standings calculation
    console.log("[SGT-SYNC] Triggering monthly standings calculation...");
    try {
      const monthlyResponse = await fetch(`${supabaseUrl}/functions/v1/sgt-calculate-monthly-standings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sync-secret": expectedSecret || "",
        },
        body: JSON.stringify({}),
      });
      
      if (monthlyResponse.ok) {
        const monthlyResult = await monthlyResponse.json();
        console.log(`[SGT-SYNC] Monthly standings calculated: ${monthlyResult.totalRecords} records, ${monthlyResult.monthsProcessed} months`);
      } else {
        console.error("[SGT-SYNC] Failed to calculate monthly standings:", await monthlyResponse.text());
      }
    } catch (e) {
      console.error("[SGT-SYNC] Error triggering monthly standings calculation:", e);
    }

    console.log(`[SGT-SYNC] ✓ Sync complete. Total records updated: ${totalRecords}`);
    console.log("[SGT-SYNC] NOTE: Cleanup is disabled. Run sgt-cleanup-ineligible manually if needed.");

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalRecords,
        message: "Sync complete (cleanup disabled - run sgt-cleanup-ineligible separately if needed)"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-SYNC] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
