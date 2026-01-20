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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check for sync secret OR admin user
  const syncSecret = req.headers.get("x-sync-secret");
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  
  let authorized = false;
  
  // Option 1: Valid sync secret (for cron/automated calls)
  if (expectedSecret && syncSecret === expectedSecret) {
    authorized = true;
  }
  
  // Option 2: Authenticated admin user
  if (!authorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      
      const { data: { user } } = await userClient.auth.getUser(token);
      if (user) {
        // Check if user is admin
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
    console.error("[SGT-SYNC] Unauthorized sync attempt - invalid secret or not admin");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // supabase client already created above

  let totalRecords = 0;
  const newMemberUserIds: number[] = []; // Track newly discovered members for auto-registration

  try {
    console.log("[SGT-SYNC] Starting SGT data sync...");

    // 1. Sync Members and detect new ones
    console.log("[SGT-SYNC] Syncing members...");
    const membersResponse = await sgtRequest("/members/list");
    const members = extractArray(membersResponse, ['members', 'results']);
    
    // Get existing member IDs from our database
    const { data: existingMembers } = await supabase
      .from("sgt_members")
      .select("user_id");
    const existingMemberIds = new Set(existingMembers?.map(m => m.user_id) || []);
    
    for (const member of members) {
      const m = member as { user_id: number; user_name: string; user_email?: string; user_active?: number; user_country_code?: string; user_has_avatar?: string; user_game_id?: string };
      
      // Track new members for auto-registration
      if (!existingMemberIds.has(m.user_id)) {
        newMemberUserIds.push(m.user_id);
        console.log(`[SGT-SYNC] New member detected: ${m.user_name} (ID: ${m.user_id})`);
      }
      
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
    console.log(`[SGT-SYNC] Synced ${members.length} members (${newMemberUserIds.length} new)`);

    // AUTO-LINK: Match SGT members to Birdies profiles by email
    // This handles cases where users registered on SGT directly and weren't linked
    console.log("[SGT-SYNC] Checking for unlinked profiles to auto-link...");
    let linkedCount = 0;
    
    // Get all profiles that don't have an sgt_user_id set
    const { data: unlinkedProfiles } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name")
      .is("sgt_user_id", null);
    
    if (unlinkedProfiles && unlinkedProfiles.length > 0) {
      // Get all SGT members with emails for matching
      const { data: sgtMembersWithEmail } = await supabase
        .from("sgt_members")
        .select("user_id, user_email, user_name")
        .not("user_email", "is", null);
      
      if (sgtMembersWithEmail && sgtMembersWithEmail.length > 0) {
        // Create email-to-sgt_user_id lookup map (case-insensitive)
        const emailToSgtId = new Map<string, { user_id: number; user_name: string }>();
        for (const member of sgtMembersWithEmail) {
          if (member.user_email) {
            emailToSgtId.set(member.user_email.toLowerCase(), {
              user_id: member.user_id,
              user_name: member.user_name
            });
          }
        }
        
        // Check each unlinked profile for a matching SGT account
        for (const profile of unlinkedProfiles) {
          const sgtMatch = emailToSgtId.get(profile.email.toLowerCase());
          
          if (sgtMatch) {
            console.log(`[SGT-SYNC] 🔗 Auto-linking ${profile.first_name} ${profile.last_name} (${profile.email}) to SGT account "${sgtMatch.user_name}" (ID: ${sgtMatch.user_id})`);
            
            // Update the profile with the SGT user ID
            // This will trigger the on_sgt_user_id_set trigger which calls sgt-auto-register
            const { error: linkError } = await supabase
              .from("profiles")
              .update({ sgt_user_id: sgtMatch.user_id })
              .eq("user_id", profile.user_id);
            
            if (linkError) {
              console.error(`[SGT-SYNC] ✗ Failed to link ${profile.email}:`, linkError);
            } else {
              console.log(`[SGT-SYNC] ✓ Successfully linked ${profile.email} to SGT ID ${sgtMatch.user_id}`);
              linkedCount++;
            }
          }
        }
      }
    }
    
    if (linkedCount > 0) {
      console.log(`[SGT-SYNC] Auto-linked ${linkedCount} profiles to SGT accounts`);
    } else {
      console.log("[SGT-SYNC] No unlinked profiles found with matching SGT accounts");
    }

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

      // 4. Sync Tournaments for this tour and auto-register members if enabled
      try {
        // Check if auto-register tournaments is enabled for this tour
        const { data: tourSettings } = await supabase
          .from("sgt_tour_settings")
          .select("auto_register_tournaments, use_combo_handicap")
          .eq("tour_id", t.tourId)
          .maybeSingle();

        const autoRegisterEnabled = tourSettings?.auto_register_tournaments ?? false;
        const useComboHcp = tourSettings?.use_combo_handicap ?? true;

        const tournamentsResponse = await sgtRequest("/tournaments/list", { tourId: t.tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']);
        
        // Get existing tournaments from our DB to detect new ones
        const { data: existingTournaments } = await supabase
          .from("sgt_tournaments")
          .select("tournament_id")
          .eq("tour_id", t.tourId);
        
        const existingTournamentIds = new Set(existingTournaments?.map(t => t.tournament_id) || []);
        
        // AUTO-REGISTER NEW MEMBERS to tour and active/upcoming tournaments
        if (newMemberUserIds.length > 0 && autoRegisterEnabled) {
          // First, add new members to the tour itself
          const tourMembersForReg = extractArray(await sgtRequest("/tours/members", { tourId: t.tourId.toString() }), ['members', 'results']) as { user_id: number }[];
          const existingTourMemberIds = new Set(tourMembersForReg.map(m => m.user_id));
          
          for (const newUserId of newMemberUserIds) {
            if (!existingTourMemberIds.has(newUserId)) {
              try {
                const apiKey = await getApiKey();
                const formData = new URLSearchParams();
                formData.append("api-key", apiKey);
                formData.append("tourId", t.tourId.toString());
                formData.append("user_id", newUserId.toString());
                formData.append("useComboCapstring", useComboHcp ? "true" : "false");
                
                const addResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/add-member`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: formData.toString(),
                });
                
                const addData = await addResponse.json();
                if (addData.success || addData.successful) {
                  console.log(`[SGT-SYNC] ✓ Added new member ${newUserId} to tour ${t.name}`);
                } else {
                  console.error(`[SGT-SYNC] ✗ Failed to add member ${newUserId} to tour ${t.name}:`, addData);
                }
              } catch (addError) {
                console.error(`[SGT-SYNC] Error adding member ${newUserId} to tour ${t.name}:`, addError);
              }
            }
          }
          
          // Now register new members for active/upcoming tournaments
          const today = new Date().toISOString().split('T')[0];
          const activeTournaments = tournaments.filter((tourn: unknown) => {
            const t = tourn as { status?: string; end_date?: string };
            const isActive = t.status === "Upcoming" || t.status === "Active" || t.status === "In Progress";
            const notEnded = !t.end_date || t.end_date >= today;
            return isActive && notEnded;
          });
          
          console.log(`[SGT-SYNC] Auto-registering ${newMemberUserIds.length} new members to ${activeTournaments.length} active tournaments for tour ${t.name}`);
          
          for (const tournament of activeTournaments) {
            const tourn = tournament as { tournamentId: number; name: string };
            
            // Get existing registrations for this tournament
            const registrationsResponse = await sgtRequest("/registrations/view", { 
              tournamentId: tourn.tournamentId.toString() 
            });
            const existingRegistrations = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
            const registeredUserIds = new Set(existingRegistrations.map(r => r.user_id));
            
            // Register new members who aren't already registered
            for (const newUserId of newMemberUserIds) {
              if (registeredUserIds.has(newUserId)) {
                console.log(`[SGT-SYNC] User ${newUserId} already registered for ${tourn.name}`);
                continue;
              }
              
              try {
                const apiKey = await getApiKey();
                const formData = new URLSearchParams();
                formData.append("api-key", apiKey);
                formData.append("tournamentId", tourn.tournamentId.toString());
                formData.append("tourId", t.tourId.toString());
                formData.append("registrationList[0][user_id]", newUserId.toString());
                formData.append("registrationList[0][useComboCap]", useComboHcp ? "true" : "false");
                formData.append("registrationList[0][useCustomCap]", "false");
                formData.append("registrationList[0][teeType]", "White");
                
                const regResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/register-members`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: formData.toString(),
                });
                
                const regData = await regResponse.json();
                if (regData.success || regData.successful) {
                  console.log(`[SGT-SYNC] ✓ Auto-registered user ${newUserId} to ${tourn.name}`);
                } else {
                  console.error(`[SGT-SYNC] ✗ Failed to auto-register user ${newUserId} to ${tourn.name}:`, regData);
                }
              } catch (regError) {
                console.error(`[SGT-SYNC] Error auto-registering user ${newUserId} to ${tourn.name}:`, regError);
              }
            }
          }
        }
        
        for (const tournament of tournaments.slice(0, 20)) { // Limit to recent 20 tournaments
          const tourn = tournament as { tournamentId: number; name: string; courseName?: string; status?: string; start_date?: string; end_date?: string };
          
          const isNewTournament = !existingTournamentIds.has(tourn.tournamentId);
          const isUpcoming = tourn.status === "Upcoming" || tourn.status === "Active" || tourn.status === "In Progress";
          
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

          // Auto-register all tour members to new tournaments if enabled
          if (autoRegisterEnabled && isNewTournament && isUpcoming) {
            console.log(`[SGT-SYNC] Auto-registering members to new tournament: ${tourn.name} (ID: ${tourn.tournamentId})`);
            
            // Get all tour members
            const { data: tourMembersData } = await supabase
              .from("sgt_tour_members")
              .select("user_id, user_name")
              .eq("tour_id", t.tourId);
            
            if (tourMembersData && tourMembersData.length > 0) {
              let registered = 0;
              let errors = 0;
              
              for (const member of tourMembersData) {
                try {
                  const apiKey = await getApiKey();
                  const formData = new URLSearchParams();
                  formData.append("api-key", apiKey);
                  formData.append("user_id", member.user_id.toString());
                  formData.append("tournament_id", tourn.tournamentId.toString());
                  
                  const regResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tournaments/add-member`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: formData.toString(),
                  });
                  
                  const regData = await regResponse.json();
                  if (regData.success || regData.feedback?.includes("already")) {
                    registered++;
                  } else {
                    errors++;
                    console.error(`[SGT-SYNC] Failed to register ${member.user_name} to tournament:`, regData);
                  }
                } catch (regError) {
                  errors++;
                  console.error(`[SGT-SYNC] Error registering ${member.user_name}:`, regError);
                }
              }
              
              console.log(`[SGT-SYNC] Auto-registration complete for ${tourn.name}: ${registered} registered, ${errors} errors`);
            }
          }

          // 5. Sync Scorecards for this tournament
          try {
            const scorecardsResponse = await sgtRequest("/tournaments/scorecards", { tournamentId: tourn.tournamentId.toString() });
            const scorecards = extractArray(scorecardsResponse, ['scorecards', 'results']);
            
            // Track which scorecards exist in SGT for this tournament
            const sgtScorecardKeys = new Set<string>();
            
            for (const scorecard of scorecards) {
              const sc = scorecard as Record<string, unknown>;
              const playerId = sc.playerId as number;
              const round = (sc.round as number) ?? 1;
              
              // Create a unique key for this scorecard
              sgtScorecardKeys.add(`${playerId}-${round}`);
              
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
            
            // Delete scorecards that no longer exist in SGT for this tournament
            const { data: existingScorecards } = await supabase
              .from("sgt_scorecards")
              .select("player_id, round")
              .eq("tournament_id", tourn.tournamentId);
            
            if (existingScorecards) {
              for (const existing of existingScorecards) {
                const key = `${existing.player_id}-${existing.round}`;
                if (!sgtScorecardKeys.has(key)) {
                  await supabase
                    .from("sgt_scorecards")
                    .delete()
                    .eq("tournament_id", tourn.tournamentId)
                    .eq("player_id", existing.player_id)
                    .eq("round", existing.round);
                  console.log(`[SGT-SYNC] Deleted scorecard: tournament ${tourn.tournamentId}, player ${existing.player_id}, round ${existing.round}`);
                }
              }
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
