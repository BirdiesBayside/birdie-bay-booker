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

  console.log("[SGT-AUTO-REG] Requesting new API key...");
  
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
  
  console.log("[SGT-AUTO-REG] API key obtained successfully");
  return cachedApiKey as string;
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
  
  registrationList.forEach((reg, index) => {
    formData.append(`registrationList[${index}][user_id]`, reg.user_id.toString());
    formData.append(`registrationList[${index}][useComboCap]`, reg.useComboCap);
    formData.append(`registrationList[${index}][useCustomCap]`, reg.useCustomCap);
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

    console.log(`[SGT-AUTO-REG] Starting auto-registration for SGT user ${sgt_user_id} to ALL active tours and tournaments`);

    // Get ALL active tours from SGT API
    const toursResponse = await sgtGetRequest("/tours/list");
    const allTours = extractArray(toursResponse, ['tours', 'results']) as { 
      tourId: number; 
      name: string; 
      active: number; 
      start_date?: string 
    }[];
    
    const activeTours = allTours.filter(t => t.active === 1);
    console.log(`[SGT-AUTO-REG] Found ${activeTours.length} active tours`);

    if (activeTours.length === 0) {
      console.log("[SGT-AUTO-REG] No active tours found");
      return new Response(
        JSON.stringify({ success: false, message: "No active tours found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let totalTourRegistrations = 0;
    let totalTournamentRegistrations = 0;
    const allErrors: string[] = [];

    // Process each active tour
    for (const tour of activeTours) {
      const tourId = tour.tourId;
      console.log(`[SGT-AUTO-REG] Processing tour ${tour.name} (ID: ${tourId})`);

      // Check if user is already a member of this tour
      const tourMembersResponse = await sgtGetRequest("/tours/members", { tourId: tourId.toString() });
      const tourMembers = extractArray(tourMembersResponse, ['members', 'results']) as { user_id: number }[];
      
      const isAlreadyMember = tourMembers.some(m => m.user_id === sgt_user_id);

      if (!isAlreadyMember) {
        // Add user to the tour with combo handicap
        console.log(`[SGT-AUTO-REG] Adding user ${sgt_user_id} to tour ${tour.name}`);
        try {
          const addMemberResult = await sgtPostRequest("/tours/add-member", {
            tourId: tourId,
            user_id: sgt_user_id,
            useComboCapstring: "true",
          });
          console.log(`[SGT-AUTO-REG] Add member result:`, addMemberResult);
          totalTourRegistrations++;
        } catch (error) {
          const errorMsg = `Failed to add to tour ${tour.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[SGT-AUTO-REG] ${errorMsg}`);
          allErrors.push(errorMsg);
          continue; // Skip tournament registration if tour registration failed
        }
      } else {
        console.log(`[SGT-AUTO-REG] User ${sgt_user_id} is already a member of tour ${tour.name}`);
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

      console.log(`[SGT-AUTO-REG] Found ${activeTournaments.length} active tournaments for tour ${tour.name}`);

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

          // Register for tournament
          console.log(`[SGT-AUTO-REG] Registering user for tournament ${tournament.name} (ID: ${tournament.tournamentId})`);
          
          const registerResult = await sgtPostRequestWithRegistrationList(
            "/registrations/register-members",
            tournament.tournamentId,
            tourId,
            [{
              user_id: sgt_user_id,
              useComboCap: "true",
              useCustomCap: "false",
              teeType: "White"
            }]
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
      toursRegistered: totalTourRegistrations,
      tournamentsRegistered: totalTournamentRegistrations,
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
