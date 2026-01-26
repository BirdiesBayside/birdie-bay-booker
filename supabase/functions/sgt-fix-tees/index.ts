import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

let cachedApiKey: string | null = null;
let apiKeyExpiry: number = 0;

function clearApiKeyCache() {
  cachedApiKey = null;
  apiKeyExpiry = 0;
}

async function getApiKey(forceRefresh = false): Promise<string> {
  const now = Date.now();
  
  if (!forceRefresh && cachedApiKey && apiKeyExpiry > now + 300000) {
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

 async function deleteAndReregisterPlayer(
   tournamentId: number, 
   tourId: number, 
   userId: number
 ): Promise<{ success: boolean; error?: string }> {
   
   // Step 1: Delete the registration
   console.log(`[SGT-FIX-TEES] Deleting registration for user ${userId}`);
   const deleteResult = await sgtPostRequest("/registrations/delete", {
     tournamentId,
     tourId,
     userId,
   }) as { success?: boolean; feedback?: string; raw?: string };
 
   if (!deleteResult.success) {
     const errorMsg = deleteResult.feedback || deleteResult.raw || JSON.stringify(deleteResult);
     return { success: false, error: `Delete failed: ${errorMsg}` };
   }
 
   // Delay between delete and re-register
   await new Promise(resolve => setTimeout(resolve, 500));
 
   // Step 2: Re-register with Blue tees
   console.log(`[SGT-FIX-TEES] Re-registering user ${userId} with Blue tees`);
   const registerResult = await sgtPostRequest("/registrations/register-members", {
     tournamentId,
     tourId,
     userIds: userId,
     tee_type: "Blue",  // Explicitly set Blue tees
   }) as { success?: boolean; feedback?: string; raw?: string };
 
   if (!registerResult.success) {
     const errorMsg = registerResult.feedback || registerResult.raw || JSON.stringify(registerResult);
     return { success: false, error: `Re-register failed: ${errorMsg}` };
   }
 
   return { success: true };
 }
 
 async function sgtPostRequest(endpoint: string, params: Record<string, string | number>, retryCount = 0): Promise<unknown> {
  const apiKey = await getApiKey();
  
  const formData = new URLSearchParams();
  formData.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    formData.append(key, value.toString());
  }

  console.log(`[SGT-FIX-TEES] POST: ${endpoint}`, params);
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const text = await response.text();
  console.log(`[SGT-FIX-TEES] Response:`, text);

  if (text.includes("INVALID API KEY") && retryCount < 1) {
    console.log("[SGT-FIX-TEES] API key invalid, refreshing and retrying...");
    clearApiKeyCache();
    await new Promise(resolve => setTimeout(resolve, 500));
    return sgtPostRequest(endpoint, params, retryCount + 1);
  }

  try {
    return JSON.parse(text);
  } catch {
    return { success: false, raw: text };
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

     console.log(`[SGT-FIX-TEES] Fixing tees for tournament ${tournament_id} by delete+re-register with Blue tees`);

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
 
     // Delete and re-register each player with Blue tees
     for (const reg of registrations) {
       const result = await deleteAndReregisterPlayer(tournament_id, tour_id, reg.user_id);
       results.push({
         userId: reg.user_id,
         userName: reg.user_name,
         oldTee: reg.tee_type || 'unknown',
         success: result.success,
         error: result.error,
       });
       
       // Longer delay between players to avoid rate limiting
       await new Promise(resolve => setTimeout(resolve, 1000));
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