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

// Registration list - teeType is intentionally omitted to use tournament defaults
async function sgtPostRequestWithRegistrationList(
  endpoint: string, 
  tournamentId: number,
  tourId: number,
  registrationList: { user_id: number; useComboCap: string; useCustomCap: string }[]
): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  
  // Note: teeType is NOT sent so the API uses tournament default tees
  registrationList.forEach((reg, index) => {
    formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
    formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
    formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
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
    const { tournament_id, tour_id } = body;

    console.log(`[SGT-TOURN-REG] Request received - Daily auto-registration for all active tournaments`);

    const results: { tournamentId: number; tournamentName: string; tourName: string; registered: number; alreadyRegistered: number; errors: string[] }[] = [];

    // If specific tournament provided, register for that one
    if (tournament_id && tour_id) {
      console.log(`[SGT-TOURN-REG] Registering all members for specific tournament ${tournament_id}`);
      const result = await registerAllMembersForTournament(tournament_id, tour_id);
      results.push(result);
    } else {
      // Get ALL active tours from SGT API
      const toursResponse = await sgtGetRequest("/tours/list");
      const allTours = extractArray(toursResponse, ['tours', 'results']) as { 
        tourId: number; 
        name: string; 
        active: number; 
      }[];
      
      const activeTours = allTours.filter(t => t.active === 1);
      console.log(`[SGT-TOURN-REG] Found ${activeTours.length} active tours`);

      // Process each active tour
      for (const tour of activeTours) {
        const tourId = tour.tourId;
        console.log(`[SGT-TOURN-REG] Processing tour ${tour.name} (ID: ${tourId})`);

        // Get all tournaments for this tour
        const tournamentsResponse = await sgtGetRequest("/tournaments/list", { tourId: tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']) as { 
          tournamentId: number; 
          name: string; 
          status?: string;
          start_date?: string;
          end_date?: string;
        }[];

        // Find tournaments that are active, in progress, OR start within the next 48 hours
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        const activeTournaments = tournaments.filter(t => {
          const startDate = t.start_date || '';
          const endDate = t.end_date || '';
          const isNotClosed = t.status !== 'Closed' && t.status !== 'Completed';
          
          // Include if:
          // 1. Already started/active/in progress and not yet ended
          // 2. Starting within 48 hours (upcoming)
          const isInProgress = t.status === 'In Progress' || t.status === 'Active';
          const hasStarted = startDate <= today && (!endDate || endDate >= today);
          const startsWithin48h = startDate > today && startDate <= in48Hours;
          const isUpcoming = t.status === 'Upcoming';
          
          return isNotClosed && (isInProgress || hasStarted || (isUpcoming && startsWithin48h));
        });

        console.log(`[SGT-TOURN-REG] Found ${activeTournaments.length} active/upcoming tournaments for tour ${tour.name} (checking up to ${in48Hours})`);

        for (const tournament of activeTournaments) {
          const result = await registerAllMembersForTournament(
            tournament.tournamentId,
            tourId,
            tournament.name,
            tour.name
          );
          results.push(result);
        }
      }
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
  tournamentName?: string,
  tourName?: string
): Promise<{ tournamentId: number; tournamentName: string; tourName: string; registered: number; alreadyRegistered: number; errors: string[] }> {
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
      tourName: tourName || `Tour ${tourId}`,
      registered: 0,
      alreadyRegistered: tourMembers.length,
      errors: []
    };
  }

  // Register all unregistered members in batches
  // Note: teeType is omitted so API uses tournament default tees
  const batchSize = 20;
  let totalRegistered = 0;

  for (let i = 0; i < membersToRegister.length; i += batchSize) {
    const batch = membersToRegister.slice(i, i + batchSize);
    
    const registrationList = batch.map(member => ({
      user_id: member.user_id,
      useComboCap: "true",
      useCustomCap: "false",
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
    tourName: tourName || `Tour ${tourId}`,
    registered: totalRegistered,
    alreadyRegistered: registeredUserIds.size,
    errors
  };
}
