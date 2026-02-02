import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const username = Deno.env.get("SGT_USERNAME");
    const password = Deno.env.get("SGT_PASSWORD");

    if (!username || !password) {
      throw new Error("SGT credentials not configured");
    }

    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);

    console.log("[SGT-REFRESH-KEY] Requesting new daily API key...");

    const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/create`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });

    const data = await response.json();

    if (!data.success || !data.key) {
      throw new Error(`Failed to authenticate with SGT API: ${JSON.stringify(data)}`);
    }

    // Store the new key - expires in 24 hours but we'll refresh daily at 4am
    const expiresAt = new Date(Date.now() + data.expires * 1000).toISOString();
    
    // Delete existing keys and insert new one (simple approach for singleton pattern)
    await supabase.from("sgt_api_config").delete().neq("api_key", "");
    
    const { error: insertError } = await supabase.from("sgt_api_config").insert({
      api_key: data.key,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      throw new Error(`Failed to store API key: ${insertError.message}`);
    }

    console.log(`[SGT-REFRESH-KEY] ✓ New API key stored, expires at ${expiresAt}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "API key refreshed successfully",
        expires_at: expiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-REFRESH-KEY] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
