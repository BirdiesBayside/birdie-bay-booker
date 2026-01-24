import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[TOGGLE-MEMBERSHIP-HOLD] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, email, put_on_hold } = await req.json();
    logStep("Request received", { user_id, email, put_on_hold });

    if (!email) {
      throw new Error("Email is required");
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Find customer by email
    const customers = await stripe.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      logStep("No Stripe customer found for email", { email });
      return new Response(
        JSON.stringify({ success: true, message: "No Stripe customer found - database updated only" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Find active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    if (subscriptions.data.length === 0) {
      logStep("No active subscriptions found");
      return new Response(
        JSON.stringify({ success: true, message: "No active subscriptions to pause" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Found active subscriptions", { count: subscriptions.data.length });

    // Pause or resume all active subscriptions
    for (const subscription of subscriptions.data) {
      if (put_on_hold) {
        // Pause the subscription - stops billing but keeps it active
        await stripe.subscriptions.update(subscription.id, {
          pause_collection: {
            behavior: "void", // Don't invoice during pause
          },
        });
        logStep("Paused subscription", { subscriptionId: subscription.id });
      } else {
        // Resume the subscription
        await stripe.subscriptions.update(subscription.id, {
          pause_collection: null, // Resume billing
        });
        logStep("Resumed subscription", { subscriptionId: subscription.id });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: put_on_hold 
          ? `Paused ${subscriptions.data.length} subscription(s)` 
          : `Resumed ${subscriptions.data.length} subscription(s)`,
        subscriptions_affected: subscriptions.data.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
