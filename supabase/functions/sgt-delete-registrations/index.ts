import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

  console.log("[SGT-DELETE] Requesting new API key...");
  
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
  
  console.log("[SGT-DELETE] API key obtained successfully");
  return cachedApiKey as string;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-DELETE] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

async function sgtDeleteRegistration(tournamentId: number, tourId: number, userId: number): Promise<{ success: boolean; error?: string }> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  formData.append("userId", userId.toString());

  console.log(`[SGT-DELETE] Deleting registration for user ${userId}`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const text = await response.text();
  console.log(`[SGT-DELETE] Response:`, text);

  try {
    const result = JSON.parse(text);
    if (result.success) {
      return { success: true };
    }
    return { success: false, error: result.feedback || text };
  } catch {
    return { success: false, error: text };
  }
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

  try {
    const body = await req.json().catch(() => ({}));
    const { tournament_id, tour_id, exclude_username } = body;

    if (!tournament_id || !tour_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id and tour_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const excludeName = exclude_username || "Daryl_C";
    console.log(`[SGT-DELETE] Deleting all registrations except ${excludeName} for tournament ${tournament_id}`);

    // Get current registrations for this tournament
    const registrationsResponse = await sgtGetRequest("/registrations/view", { 
      tournamentId: tournament_id.toString() 
    });
    
    const registrations = extractArray(registrationsResponse, ['registrations', 'results']) as { 
      user_id: number; 
      user_name: string;
    }[];

    console.log(`[SGT-DELETE] Found ${registrations.length} registrations`);

    // Filter out the excluded user
    const toDelete = registrations.filter(r => r.user_name !== excludeName);
    const excluded = registrations.filter(r => r.user_name === excludeName);

    console.log(`[SGT-DELETE] Will delete ${toDelete.length} registrations, keeping ${excluded.length} (${excludeName})`);

    const results: { userId: number; userName: string; success: boolean; error?: string }[] = [];

    // Delete each registration
    for (const reg of toDelete) {
      const result = await sgtDeleteRegistration(tournament_id, tour_id, reg.user_id);
      results.push({
        userId: reg.user_id,
        userName: reg.user_name,
        success: result.success,
        error: result.error,
      });
      
      // Small delay between deletions
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[SGT-DELETE] Completed: ${successCount} deleted, ${failCount} failed, ${excluded.length} kept`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalRegistrations: registrations.length,
        deleted: successCount,
        failed: failCount,
        kept: excluded.map(r => r.user_name),
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-DELETE] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
