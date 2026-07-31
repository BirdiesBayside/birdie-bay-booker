import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSgtApiKey, getSgtConfig } from "../_shared/sgt-config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const config = await getSgtConfig(true);

    if (!config.username || !config.password) {
      // Not an error for a fresh install — the club simply hasn't entered
      // their SGT credentials in SGT Manager → Settings yet.
      console.log("[SGT-REFRESH-KEY] Skipped: credentials not configured");
      return new Response(
        JSON.stringify({ ok: true, skipped_reason: "sgt_credentials_not_configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-REFRESH-KEY] Requesting new daily API key for ${config.clubUrl}...`);
    const { expiresAt } = await createSgtApiKey();
    console.log(`[SGT-REFRESH-KEY] ✓ New API key stored, expires at ${expiresAt}`);

    return new Response(
      JSON.stringify({ ok: true, success: true, expires_at: expiresAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[SGT-REFRESH-KEY] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
