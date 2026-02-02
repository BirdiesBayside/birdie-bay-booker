import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

let supabaseClient: ReturnType<typeof createClient>;

interface ApiConfig {
  api_key: string;
  expires_at: string;
}

interface Tournament {
  tournament_id: number;
  tour_id: number;
  name: string;
  start_date: string;
}

interface TourMember {
  user_id: number;
  custom_hcp: number | null;
}

// Get API key - READ-ONLY from database
async function getApiKey(): Promise<string> {
  const { data: configData } = await supabaseClient
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const config = configData as ApiConfig | null;

  if (!config?.api_key) {
    throw new Error("No API key found - run sgt-refresh-api-key first");
  }

  if (new Date(config.expires_at) <= new Date()) {
    throw new Error("API key expired - wait for 4am refresh");
  }

  return config.api_key;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-DAILY-REG] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

interface RegistrationItem {
  user_id: number;
  useComboCap: string;
  useCustomCap: string;
  customCap?: number;
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
  });

  console.log(`[SGT-DAILY-REG] POST: ${endpoint} with ${registrationList.length} registrations`);
  
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
  supabaseClient = createClient(supabaseUrl, supabaseKey);

  try {
    // Calculate tomorrow's date (in Brisbane timezone)
    const now = new Date();
    const brisbaneOffset = 10 * 60; // UTC+10
    const brisbaneTime = new Date(now.getTime() + brisbaneOffset * 60 * 1000);
    const tomorrow = new Date(brisbaneTime);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`[SGT-DAILY-REG] Looking for tournaments starting tomorrow: ${tomorrowStr}`);

    // Get tournaments starting tomorrow from our local cache
    const { data: tournamentsData, error: tError } = await supabaseClient
      .from("sgt_tournaments")
      .select("tournament_id, tour_id, name, start_date")
      .eq("start_date", tomorrowStr);

    if (tError) {
      throw tError;
    }

    const tournaments = (tournamentsData || []) as Tournament[];

    if (tournaments.length === 0) {
      console.log("[SGT-DAILY-REG] No tournaments starting tomorrow");
      return new Response(
        JSON.stringify({ success: true, message: "No tournaments starting tomorrow", registered: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-DAILY-REG] Found ${tournaments.length} tournament(s) starting tomorrow`);

    let totalRegistrations = 0;
    const errors: string[] = [];

    for (const tournament of tournaments) {
      try {
        console.log(`[SGT-DAILY-REG] Processing: ${tournament.name} (ID: ${tournament.tournament_id})`);

        // Get all tour members for this tour
        const { data: tourMembersData, error: tmError } = await supabaseClient
          .from("sgt_tour_members")
          .select("user_id, custom_hcp")
          .eq("tour_id", tournament.tour_id);

        const tourMembers = (tourMembersData || []) as TourMember[];

        if (tmError || tourMembers.length === 0) {
          console.log(`[SGT-DAILY-REG] No tour members for tour ${tournament.tour_id}`);
          continue;
        }

        // Get current registrations from SGT API
        const registrationsResponse = await sgtGetRequest("/registrations/view", {
          tournamentId: tournament.tournament_id.toString()
        });
        const existingRegs = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
        const registeredUserIds = new Set(existingRegs.map(r => r.user_id));

        // Find members not yet registered
        const toRegister: RegistrationItem[] = [];
        
        for (const member of tourMembers) {
          if (registeredUserIds.has(member.user_id)) {
            continue; // Already registered
          }

          // Check if player has any scorecards (determines combo vs custom HCP)
          const { data: scorecards } = await supabaseClient
            .from("sgt_scorecards")
            .select("id")
            .eq("player_id", member.user_id)
            .limit(1);

          const hasPlayedRounds = scorecards && scorecards.length > 0;
          const useCustomCap = !hasPlayedRounds && member.custom_hcp !== null;

          const regItem: RegistrationItem = {
            user_id: member.user_id,
            useComboCap: useCustomCap ? "false" : "true",
            useCustomCap: useCustomCap ? "true" : "false",
          };

          if (useCustomCap && member.custom_hcp !== null) {
            regItem.customCap = member.custom_hcp;
          }

          toRegister.push(regItem);
        }

        if (toRegister.length === 0) {
          console.log(`[SGT-DAILY-REG] All members already registered for ${tournament.name}`);
          continue;
        }

        // Register in batches of 10 to avoid API limits
        const batchSize = 10;
        for (let i = 0; i < toRegister.length; i += batchSize) {
          const batch = toRegister.slice(i, i + batchSize);
          
          await sgtPostRequestWithRegistrationList(
            "/registrations/register-members",
            tournament.tournament_id,
            tournament.tour_id,
            batch
          );
          
          console.log(`[SGT-DAILY-REG] Registered batch of ${batch.length} for ${tournament.name}`);
          totalRegistrations += batch.length;
        }

      } catch (error) {
        const msg = `Failed to process ${tournament.name}: ${error instanceof Error ? error.message : 'Unknown'}`;
        console.error(`[SGT-DAILY-REG] ${msg}`);
        errors.push(msg);
      }
    }

    const result = {
      success: true,
      tournamentsProcessed: tournaments.length,
      registrations: totalRegistrations,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(`[SGT-DAILY-REG] Complete:`, result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-DAILY-REG] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
