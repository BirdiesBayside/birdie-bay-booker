import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[GET-STRIPE-PUBLISHABLE-KEY] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw userError;
    if (!data.user) throw new Error("User not authenticated");

    const rawKey =
      Deno.env.get("VITE_STRIPE_PUBLISHABLE_KEY") ||
      Deno.env.get("STRIPE_PUBLISHABLE_KEY") ||
      "";

    const publishableKey = rawKey.trim();

    if (!publishableKey) {
      throw new Error(
        "Stripe publishable key not configured (VITE_STRIPE_PUBLISHABLE_KEY)"
      );
    }

    // Never return restricted/secret keys by accident.
    if (!/^pk_(test|live)_/i.test(publishableKey)) {
      logStep("Invalid key prefix", { keyPrefix: publishableKey.slice(0, 8) });
      throw new Error(
        "Stripe publishable key is invalid (expected pk_test_... or pk_live_...)."
      );
    }

    logStep("Returning publishable key", {
      userId: data.user.id,
      keyPrefix: publishableKey.slice(0, 8),
    });

    return new Response(JSON.stringify({ publishableKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });

    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
