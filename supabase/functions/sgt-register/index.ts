import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";

// Cache for API key
let cachedApiKey: { key: string; expiresAt: Date } | null = null;

async function getApiKey(supabase: any, clubUrl: string): Promise<string> {
  // Check if cached key is still valid (with 5 min buffer)
  if (cachedApiKey && cachedApiKey.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return cachedApiKey.key;
  }

  // Try to get from database first
  const { data: config } = await supabase
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (config && new Date(config.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    cachedApiKey = { key: config.api_key, expiresAt: new Date(config.expires_at) };
    return config.api_key;
  }

  // Need to authenticate and get new key
  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password || !clubUrl) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  // Use the correct endpoint: apikey/create (matching sgt-sync)
  console.log(`[SGT-REGISTER] Requesting API key from ${SGT_BASE_URL}/${clubUrl}/apikey/create`);
  
  const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error(`[SGT-REGISTER] API key request failed: ${response.status}, body: ${responseText.substring(0, 200)}`);
    throw new Error(`SGT API temporarily unavailable. Please try again in a few minutes.`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error(`[SGT-REGISTER] Invalid JSON response: ${responseText.substring(0, 200)}`);
    throw new Error("SGT API returned invalid response. Please try again in a few minutes.");
  }
  
  // Response format is { success: boolean, key: string, expires: number }
  if (!data.success || !data.key) {
    console.error(`[SGT-REGISTER] API key auth failed:`, data);
    throw new Error("Failed to authenticate with SGT API");
  }

  // Store in database - use expires from response (in seconds)
  const expiresAt = new Date(Date.now() + (data.expires * 1000));
  await supabase.from("sgt_api_config").upsert({
    api_key: data.key,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  });

  cachedApiKey = { key: data.key, expiresAt };
  console.log("[SGT-REGISTER] API key obtained successfully");
  return data.key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clubUrl = Deno.env.get("SGT_CLUB_URL")!;

  const authHeader = req.headers.get("Authorization");
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("[SGT-REGISTER] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, username, password } = await req.json();
    console.log(`[SGT-REGISTER] Action: ${action}, User: ${user.id}`);

    const apiKey = await getApiKey(adminClient, clubUrl);

    if (action === "check-username") {
      // Check if username is available by checking existing members
      const membersResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/list?api-key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );

      if (!membersResponse.ok) {
        throw new Error("Failed to fetch members list");
      }

      const membersData = await membersResponse.json();
      const existingUsernames = (membersData.members || []).map((m: any) => 
        m.user_name.toLowerCase()
      );

      const isAvailable = !existingUsernames.includes(username.toLowerCase());

      return new Response(
        JSON.stringify({ available: isAvailable }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "register") {
      if (!username || !password) {
        return new Response(
          JSON.stringify({ error: "Username and password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate username format (2-64 alphanumeric or underscore)
      if (!/^[a-zA-Z0-9_]{2,64}$/.test(username)) {
        return new Response(
          JSON.stringify({ error: "Username must be 2-64 alphanumeric characters or underscores" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate password (min 6 chars)
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Register the new user with SGT
      const formData = new URLSearchParams();
      formData.append("api-key", apiKey);
      formData.append("user_name", username);
      formData.append("user_email", user.email!);
      formData.append("user_password_new", password);

      console.log(`[SGT-REGISTER] Registering user: ${username} with email: ${user.email}`);

      const registerResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/register-new`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: formData.toString(),
        }
      );

      const registerData = await registerResponse.json();
      console.log("[SGT-REGISTER] Register response:", registerData);

      if (!registerData.successful) {
        return new Response(
          JSON.stringify({ 
            error: registerData.feedback || "Registration failed",
            details: registerData 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract user_id from the response
      // The API returns userData with user_game_id and username
      // We need to fetch the members list to get the actual user_id
      const membersResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/list?api-key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );

      if (!membersResponse.ok) {
        throw new Error("Failed to fetch members after registration");
      }

      const membersData = await membersResponse.json();
      const newMember = (membersData.members || []).find((m: any) => 
        m.user_name.toLowerCase() === username.toLowerCase()
      );

      if (!newMember) {
        console.error("[SGT-REGISTER] Could not find newly registered member");
        return new Response(
          JSON.stringify({ 
            error: "Registration succeeded but could not find member ID. Please contact support." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sgtUserId = newMember.user_id;
      console.log(`[SGT-REGISTER] Found new member with SGT user_id: ${sgtUserId}`);

      // Update the user's profile with the SGT user ID
      // This will trigger the auto-registration for tours/tournaments
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ sgt_user_id: sgtUserId })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[SGT-REGISTER] Failed to update profile:", updateError);
        return new Response(
          JSON.stringify({ 
            error: "Account created but failed to link. Please contact support.",
            sgt_user_id: sgtUserId
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[SGT-REGISTER] Successfully linked SGT account ${sgtUserId} to user ${user.id}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          sgt_user_id: sgtUserId,
          username: username,
          message: "SGT account created and linked successfully!"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-REGISTER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
