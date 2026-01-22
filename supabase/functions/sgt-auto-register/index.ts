import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

let cachedApiKey: { key: string; expiresAt: Date } | null = null;

// Try to refresh an existing API key before it expires
async function refreshApiKey(existingKey: string): Promise<{ key: string; expiresAt: Date } | null> {
  const formData = new URLSearchParams();
  formData.append("api-key", existingKey);

  console.log(`[SGT-AUTO-REG] Attempting to refresh API key...`);
  
  try {
    const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.log(`[SGT-AUTO-REG] Refresh failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.success || !data.key) {
      console.log(`[SGT-AUTO-REG] Refresh unsuccessful:`, data);
      return null;
    }

    console.log(`[SGT-AUTO-REG] API key refreshed successfully`);
    return {
      key: data.key,
      expiresAt: new Date(Date.now() + (data.expires * 1000)),
    };
  } catch (e) {
    console.error(`[SGT-AUTO-REG] Refresh error:`, e);
    return null;
  }
}

// Create a new API key using username/password
async function createNewApiKey(): Promise<{ key: string; expiresAt: Date }> {
  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  console.log("[SGT-AUTO-REG] Creating new API key...");
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const data = await response.json();

  if (!data.success || !data.key) {
    throw new Error("Failed to authenticate with SGT API");
  }

  console.log("[SGT-AUTO-REG] New API key created successfully");
  return {
    key: data.key,
    expiresAt: new Date(Date.now() + (data.expires * 1000)),
  };
}

async function getApiKey(supabase?: any): Promise<string> {
  const BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer

  // Check if cached key is still valid
  if (cachedApiKey && cachedApiKey.expiresAt.getTime() > Date.now() + BUFFER_MS) {
    return cachedApiKey.key;
  }

  // Try to get from database first (if supabase client provided)
  if (supabase) {
    const { data: config } = await supabase
      .from("sgt_api_config")
      .select("api_key, expires_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (config?.api_key) {
      const expiresAt = new Date(config.expires_at);
      const timeUntilExpiry = expiresAt.getTime() - Date.now();

      // If key is still valid with buffer, use it
      if (timeUntilExpiry > BUFFER_MS) {
        cachedApiKey = { key: config.api_key, expiresAt };
        return config.api_key;
      }

      // Key exists but expiring soon - try to REFRESH it first
      console.log(`[SGT-AUTO-REG] Key expiring in ${Math.round(timeUntilExpiry / 1000)}s, attempting refresh...`);
      const refreshed = await refreshApiKey(config.api_key);
      
      if (refreshed) {
        // Store refreshed key in DB
        await supabase.from("sgt_api_config").upsert({
          api_key: refreshed.key,
          expires_at: refreshed.expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        });
        cachedApiKey = refreshed;
        return refreshed.key;
      }
      
      console.log(`[SGT-AUTO-REG] Refresh failed, creating new key...`);
    }
  } else if (cachedApiKey) {
    // No supabase but have cached key - try refresh
    const refreshed = await refreshApiKey(cachedApiKey.key);
    if (refreshed) {
      cachedApiKey = refreshed;
      return refreshed.key;
    }
  }

  // No valid key or refresh failed - create new one
  const newKey = await createNewApiKey();
  cachedApiKey = newKey;

  // Store in database if supabase client provided
  if (supabase) {
    await supabase.from("sgt_api_config").upsert({
      api_key: newKey.key,
      expires_at: newKey.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return newKey.key;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-AUTO-REG] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

async function sgtPostRequest(endpoint: string, body: Record<string, string | number>): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(body)) {
    formData.append(key, value.toString());
  }

  console.log(`[SGT-AUTO-REG] POST: ${endpoint}`);
  
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

interface RegistrationItem {
  user_id: number;
  useComboCap: string;
  useCustomCap: string;
  customCap?: number;
  teeType: string;
}

async function sgtPostRequestWithRegistrationList(
  endpoint: string, 
  tournamentId: number,
  tourId: number,
  registrationList: RegistrationItem[]
): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  
  registrationList.forEach((reg, index) => {
    formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
    formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
    formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
    if (reg.useCustomCap === "true" && reg.customCap !== undefined) {
      formData.append(`registrationList[${index}][customCap]`, reg.customCap.toString());
    }
    formData.append(`registrationList[${index}][teeType]`, reg.teeType);
  });

  console.log(`[SGT-AUTO-REG] POST: ${endpoint} with ${registrationList.length} registrations`);
  
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

  try {
    const { sgt_user_id } = await req.json();

    if (!sgt_user_id) {
      return new Response(
        JSON.stringify({ error: "sgt_user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-AUTO-REG] Processing registration for SGT user ${sgt_user_id}`);

    // Check if this member has been onboarded (exists in sgt_tour_members)
    const { data: tourMemberRecords, error: tmError } = await supabase
      .from("sgt_tour_members")
      .select("tour_id, custom_hcp")
      .eq("user_id", sgt_user_id);

    if (tmError) {
      console.error("[SGT-AUTO-REG] Error checking tour members:", tmError);
      throw tmError;
    }

    // If member is NOT in any tours, they're pending onboarding - skip auto-registration
    if (!tourMemberRecords || tourMemberRecords.length === 0) {
      console.log(`[SGT-AUTO-REG] User ${sgt_user_id} not yet onboarded (not in any tours). Skipping auto-registration.`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: "Member not yet onboarded. Awaiting admin to set handicap.",
          pending: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Member IS onboarded - proceed with tournament registration
    console.log(`[SGT-AUTO-REG] User ${sgt_user_id} is onboarded in ${tourMemberRecords.length} tour(s). Registering for tournaments...`);

    // Build a map of tour_id -> custom_hcp for quick lookup
    const tourHcpMap = new Map<number, number | null>();
    for (const tm of tourMemberRecords) {
      tourHcpMap.set(tm.tour_id, tm.custom_hcp);
    }

    // Get tours this member belongs to
    const memberTourIds = Array.from(tourHcpMap.keys());

    let totalTournamentRegistrations = 0;
    const allErrors: string[] = [];

    // Check if the player has any scorecards (meaning they've played rounds)
    const { data: existingScorecards, error: scError } = await supabase
      .from("sgt_scorecards")
      .select("id")
      .eq("user_id", sgt_user_id)
      .limit(1);

    const hasPlayedRounds = !scError && existingScorecards && existingScorecards.length > 0;
    
    if (hasPlayedRounds) {
      console.log(`[SGT-AUTO-REG] Player has played rounds - will use Combo HCP for future tournaments`);
    }

    // Process each tour the member is in
    for (const tourId of memberTourIds) {
      console.log(`[SGT-AUTO-REG] Processing tour ID: ${tourId}`);

      // Get the custom handicap for this tour
      const customHcp = tourHcpMap.get(tourId);
      
      // Use custom HCP only if:
      // 1. A custom HCP is set AND
      // 2. The player has NOT played any rounds yet (first tournament)
      const useCustomCap = !hasPlayedRounds && customHcp !== null && customHcp !== undefined;

      if (useCustomCap) {
        console.log(`[SGT-AUTO-REG] First tournament - using custom handicap ${customHcp} for user ${sgt_user_id} in tour ${tourId}`);
      } else if (hasPlayedRounds) {
        console.log(`[SGT-AUTO-REG] Player has history - using Combo HCP for user ${sgt_user_id} in tour ${tourId}`);
      }

      // Get all tournaments for this tour
      const tournamentsResponse = await sgtGetRequest("/tournaments/list", { tourId: tourId.toString() });
      const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']) as { 
        tournamentId: number; 
        name: string; 
        status?: string;
        start_date?: string;
        end_date?: string;
      }[];

      // Filter for active/upcoming tournaments (not closed)
      const today = new Date().toISOString().split('T')[0];
      const activeTournaments = tournaments.filter(t => {
        const isNotClosed = t.status !== 'Closed' && t.status !== 'Completed';
        const endDate = t.end_date || '';
        const isFutureOrToday = !endDate || endDate >= today;
        return isNotClosed && isFutureOrToday;
      });

      console.log(`[SGT-AUTO-REG] Found ${activeTournaments.length} active tournaments for tour ${tourId}`);

      // Register user for each active tournament
      for (const tournament of activeTournaments) {
        try {
          // Check if already registered
          const registrationsResponse = await sgtGetRequest("/registrations/view", { 
            tournamentId: tournament.tournamentId.toString() 
          });
          const registrations = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
          
          if (registrations.some(r => r.user_id === sgt_user_id)) {
            console.log(`[SGT-AUTO-REG] User already registered for tournament ${tournament.name}`);
            continue;
          }

          // Build registration with custom handicap if available
          const registrationItem: RegistrationItem = {
            user_id: sgt_user_id,
            useComboCap: useCustomCap ? "false" : "true",
            useCustomCap: useCustomCap ? "true" : "false",
            teeType: "White"
          };
          
          if (useCustomCap && customHcp !== null) {
            registrationItem.customCap = customHcp;
          }

          // Register for tournament
          console.log(`[SGT-AUTO-REG] Registering user for tournament ${tournament.name} (ID: ${tournament.tournamentId})${useCustomCap ? ` with custom HCP ${customHcp}` : ''}`);
          
          const registerResult = await sgtPostRequestWithRegistrationList(
            "/registrations/register-members",
            tournament.tournamentId,
            tourId,
            [registrationItem]
          );

          console.log(`[SGT-AUTO-REG] Registration result for ${tournament.name}:`, registerResult);
          totalTournamentRegistrations++;
        } catch (error) {
          const errorMsg = `Failed to register for ${tournament.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[SGT-AUTO-REG] ${errorMsg}`);
          allErrors.push(errorMsg);
        }
      }
    }

    // Trigger a sync to update local cache
    try {
      const syncSecret = Deno.env.get("SYNC_SECRET");
      if (syncSecret) {
        console.log("[SGT-AUTO-REG] Triggering data sync...");
        await fetch(`${supabaseUrl}/functions/v1/sgt-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sync-secret": syncSecret,
          },
        });
      }
    } catch (syncError) {
      console.error("[SGT-AUTO-REG] Sync trigger failed:", syncError);
    }

    const result = {
      success: true,
      tournamentsRegistered: totalTournamentRegistrations,
      toursProcessed: memberTourIds.length,
      errors: allErrors.length > 0 ? allErrors : undefined,
    };

    console.log(`[SGT-AUTO-REG] Completed:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-AUTO-REG] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
