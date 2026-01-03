import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
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

  console.log("[SGT-TOURN-REG] Requesting new API key...");
  
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
  
  console.log("[SGT-TOURN-REG] API key obtained successfully");
  return cachedApiKey as string;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-TOURN-REG] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

async function sgtPostRequestWithRegistrationList(
  endpoint: string, 
  tournamentId: number,
  tourId: number,
  registrationList: { user_id: number; useComboCap: string; useCustomCap: string; teeType: string }[]
): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  
  // Add registration list entries
  registrationList.forEach((reg, index) => {
    formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
    formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
    formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
    formData.append(`registrationList[${index}][teeType]`, reg.teeType);
  });

  console.log(`[SGT-TOURN-REG] POST: ${endpoint} with ${registrationList.length} registrations`);
  
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
    const body = await req.json().catch(() => ({}));
    const { tournament_id, tour_id, register_all_active_tournaments } = body;

    console.log(`[SGT-TOURN-REG] Request received:`, { tournament_id, tour_id, register_all_active_tournaments });

    // Get tour settings
    const { data: tourSettings } = await supabase
      .from("sgt_tour_settings")
      .select("*")
      .eq("auto_register_tournaments", true);

    if (!tourSettings || tourSettings.length === 0) {
      console.log("[SGT-TOURN-REG] No tours with auto_register_tournaments enabled");
      return new Response(
        JSON.stringify({ success: false, message: "No tours with auto-registration enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { tournamentId: number; tournamentName: string; registered: number; alreadyRegistered: number; errors: string[] }[] = [];

    // If specific tournament provided, register for that one
    if (tournament_id && tour_id) {
      const result = await registerAllMembersForTournament(
        tournament_id, 
        tour_id, 
        tourSettings.find(t => t.tour_id === tour_id)?.use_combo_handicap ?? true
      );
      results.push(result);
    } 
    // Otherwise, check all active tournaments that need registration
    else if (register_all_active_tournaments) {
      for (const settings of tourSettings) {
        const tourId = settings.tour_id;
        const useComboCap = settings.use_combo_handicap;

        console.log(`[SGT-TOURN-REG] Processing tour ${tourId}`);

        // Get all tournaments for this tour
        const tournamentsResponse = await sgtGetRequest("/tournaments/list", { tourId: tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']) as { 
          tournamentId: number; 
          name: string; 
          status?: string;
          start_date?: string;
          end_date?: string;
        }[];

        // Find tournaments that have started but are not completed
        const today = new Date().toISOString().split('T')[0];
        const activeTournaments = tournaments.filter(t => {
          const startDate = t.start_date || '';
          const isStarted = startDate <= today;
          const isNotClosed = t.status !== 'Closed' && t.status !== 'Completed';
          return isStarted && isNotClosed;
        });

        console.log(`[SGT-TOURN-REG] Found ${activeTournaments.length} active tournaments for tour ${tourId}`);

        for (const tournament of activeTournaments) {
          const result = await registerAllMembersForTournament(
            tournament.tournamentId,
            tourId,
            useComboCap,
            tournament.name
          );
          results.push(result);
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Provide tournament_id + tour_id, or set register_all_active_tournaments: true" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Trigger a sync to update local cache
    try {
      const syncSecret = Deno.env.get("SYNC_SECRET");
      if (syncSecret) {
        console.log("[SGT-TOURN-REG] Triggering data sync...");
        await fetch(`${supabaseUrl}/functions/v1/sgt-sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-sync-secret": syncSecret,
          },
        });
      }
    } catch (syncError) {
      console.error("[SGT-TOURN-REG] Sync trigger failed:", syncError);
    }

    const totalRegistered = results.reduce((sum, r) => sum + r.registered, 0);
    const totalAlreadyRegistered = results.reduce((sum, r) => sum + r.alreadyRegistered, 0);

    console.log(`[SGT-TOURN-REG] Completed: ${totalRegistered} new registrations, ${totalAlreadyRegistered} already registered`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalRegistered,
        totalAlreadyRegistered,
        tournaments: results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-TOURN-REG] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function registerAllMembersForTournament(
  tournamentId: number, 
  tourId: number, 
  useComboCap: boolean,
  tournamentName?: string
): Promise<{ tournamentId: number; tournamentName: string; registered: number; alreadyRegistered: number; errors: string[] }> {
  const errors: string[] = [];
  
  console.log(`[SGT-TOURN-REG] Registering all members for tournament ${tournamentId} (tour ${tourId})`);

  // Get current registrations for this tournament
  const registrationsResponse = await sgtGetRequest("/registrations/view", { 
    tournamentId: tournamentId.toString() 
  });
  const currentRegistrations = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
  const registeredUserIds = new Set(currentRegistrations.map(r => r.user_id));

  console.log(`[SGT-TOURN-REG] Tournament has ${registeredUserIds.size} existing registrations`);

  // Get all tour members
  const tourMembersResponse = await sgtGetRequest("/tours/members", { tourId: tourId.toString() });
  const tourMembers = extractArray(tourMembersResponse, ['members', 'results']) as { user_id: number; user_name: string }[];

  console.log(`[SGT-TOURN-REG] Tour has ${tourMembers.length} members`);

  // Find members not yet registered
  const membersToRegister = tourMembers.filter(m => !registeredUserIds.has(m.user_id));

  console.log(`[SGT-TOURN-REG] ${membersToRegister.length} members need registration`);

  if (membersToRegister.length === 0) {
    return {
      tournamentId,
      tournamentName: tournamentName || `Tournament ${tournamentId}`,
      registered: 0,
      alreadyRegistered: tourMembers.length,
      errors: []
    };
  }

  // Register all unregistered members in batches
  const batchSize = 20;
  let totalRegistered = 0;

  for (let i = 0; i < membersToRegister.length; i += batchSize) {
    const batch = membersToRegister.slice(i, i + batchSize);
    
    const registrationList = batch.map(member => ({
      user_id: member.user_id,
      useComboCap: useComboCap ? "true" : "false",
      useCustomCap: "false",
      teeType: "White"
    }));

    try {
      const result = await sgtPostRequestWithRegistrationList(
        "/registrations/register-members",
        tournamentId,
        tourId,
        registrationList
      );
      
      console.log(`[SGT-TOURN-REG] Batch registration result:`, result);
      totalRegistered += batch.length;
    } catch (error) {
      const errorMsg = `Batch registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`[SGT-TOURN-REG] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  return {
    tournamentId,
    tournamentName: tournamentName || `Tournament ${tournamentId}`,
    registered: totalRegistered,
    alreadyRegistered: registeredUserIds.size,
    errors
  };
}
