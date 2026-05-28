import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";

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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-07-30.basil" as any });

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

    // List ALL non-terminal subs (active, past_due, trialing, unpaid, paused)
    // so we catch every subscription regardless of paused/billing state.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });

    const relevantStatuses = new Set([
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
    ]);

    const targets = subscriptions.data.filter((s) => relevantStatuses.has(s.status));

    if (targets.length === 0) {
      logStep("No manageable subscriptions found", {
        all_statuses: subscriptions.data.map((s) => s.status),
      });
      return new Response(
        JSON.stringify({ success: true, message: "No manageable subscriptions" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logStep("Found subscriptions to update", { count: targets.length });

    const results: Array<{ id: string; action: string; previous_pause?: unknown }> = [];

    for (const subscription of targets) {
      if (put_on_hold) {
        const updated = await stripe.subscriptions.update(subscription.id, {
          pause_collection: { behavior: "void" },
        });
        logStep("Paused subscription", { subscriptionId: subscription.id, status: updated.status });
        results.push({ id: subscription.id, action: "paused" });
      } else {
        // ALWAYS clear pause_collection on resume, even if it wasn't visibly set,
        // to guarantee billing actually resumes.
        const updated = await stripe.subscriptions.update(subscription.id, {
          pause_collection: "" as any, // Stripe accepts empty string to unset
        });
        logStep("Resumed subscription", {
          subscriptionId: subscription.id,
          status: updated.status,
          pause_collection_after: updated.pause_collection,
          previous_pause: subscription.pause_collection,
        });
        results.push({
          id: subscription.id,
          action: "resumed",
          previous_pause: subscription.pause_collection,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: put_on_hold
          ? `Paused ${results.length} subscription(s)`
          : `Resumed ${results.length} subscription(s)`,
        subscriptions_affected: results.length,
        results,
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
