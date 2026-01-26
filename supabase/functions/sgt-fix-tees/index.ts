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

  console.log("[SGT-FIX-TEES] Requesting new API key...");
  
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
  
  console.log("[SGT-FIX-TEES] API key obtained successfully");
  return cachedApiKey as string;
}

async function sgtGetRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-FIX-TEES] GET: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  return response.json();
}

// Edit a single registration to set tee_type to "Default"
async function editRegistrationTee(
  tournamentId: number, 
  tourId: number, 
  userId: number
): Promise<{ success: boolean; error?: string }> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  formData.append("tournamentId", tournamentId.toString());
  formData.append("tourId", tourId.toString());
  formData.append("userId", userId.toString());
  formData.append("tee_type", "Default"); // This sets to tournament default tees

  console.log(`[SGT-FIX-TEES] Editing registration for user ${userId} to Default tees`);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const text = await response.text();
  console.log(`[SGT-FIX-TEES] Edit response for user ${userId}:`, text);

  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}: ${text}` };
  }

  try {
    const data = JSON.parse(text);
    return { success: data.success === true, error: data.feedback };
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
    const { tournament_id, tour_id } = body;

    if (!tournament_id || !tour_id) {
      return new Response(
        JSON.stringify({ error: "tournament_id and tour_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-FIX-TEES] Fixing tees for tournament ${tournament_id}`);

    // Get current registrations for this tournament
    const registrationsResponse = await sgtGetRequest("/registrations/view", { 
      tournamentId: tournament_id.toString() 
    });
    
    const registrations = extractArray(registrationsResponse, ['registrations', 'results']) as { 
      user_id: number; 
      user_name: string;
      tee_type?: string;
    }[];

    console.log(`[SGT-FIX-TEES] Found ${registrations.length} registrations`);
    console.log(`[SGT-FIX-TEES] Current tee types:`, registrations.map(r => ({ user: r.user_name, tee: r.tee_type })));

    const results: { userId: number; userName: string; oldTee: string; success: boolean; error?: string }[] = [];

    // Edit each registration to set tee_type to "Default"
    for (const reg of registrations) {
      const result = await editRegistrationTee(tournament_id, tour_id, reg.user_id);
      results.push({
        userId: reg.user_id,
        userName: reg.user_name,
        oldTee: reg.tee_type || 'unknown',
        success: result.success,
        error: result.error,
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`[SGT-FIX-TEES] Completed: ${successCount} success, ${failCount} failed`);

    return new Response(
      JSON.stringify({ 
        success: true,
        totalRegistrations: registrations.length,
        fixed: successCount,
        failed: failCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-FIX-TEES] Error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
