import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { cancellationPlan } from "./cancellation.ts";

const BodySchema = z.object({
  user_id: z.string().uuid(),
  send_notification: z.boolean().default(true),
  preview: z.boolean().default(false),
});

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CANCEL-MEMBERSHIP] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    const { data: auth, error: authError } = await supabaseClient.auth.getUser(token ?? "");
    if (authError || !auth.user) {
      return new Response(JSON.stringify({ error: "Please sign in." }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: admin, error: roleError } = await supabaseClient.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
    if (roleError || !admin) {
      return new Response(JSON.stringify({ error: "Only staff administrators can cancel memberships." }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid cancellation request." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { user_id, send_notification, preview } = parsed.data;
    logStep("Processing cancellation", { user_id });

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("email, membership_tier, custom_billing, payment_failed_at")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    logStep("Profile found", { email: profile.email, tier: profile.membership_tier });

    if (profile.custom_billing) throw new Error("This customer uses custom billing. Manage their membership through the custom billing controls.");
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-07-30.basil" });

    // Plan all subscriptions before mutating anything. Preview uses this same path.
    const plans = [];
    for await (const customer of stripe.customers.list({ email: profile.email, limit: 100 })) {
      for await (const sub of stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 100 })) {
        if (!["active", "past_due", "unpaid"].includes(sub.status)) continue;
        let lastPaidAt = 0;
        for await (const invoice of stripe.invoices.list({ subscription: sub.id, status: "paid", limit: 100 })) {
          const paidAt = invoice.status_transitions?.paid_at;
          if (invoice.amount_paid > 0 && paidAt) lastPaidAt = Math.max(lastPaidAt, paidAt);
        }
        const failed = Boolean(profile.payment_failed_at) || sub.status !== "active";
        const plan = cancellationPlan(lastPaidAt, Math.floor(Date.now() / 1000), failed);
        plans.push({ sub, ...plan });
      }
    }
    if (!plans.length) throw new Error("No current membership subscription found. No changes were made.");
    if (!preview) {
      for (const plan of plans) {
        if (plan.scheduled) {
          await stripe.subscriptions.update(plan.sub.id, {
            cancel_at: plan.endsAt,
            proration_behavior: "none",
            metadata: { cancellation_reason: "voluntary", send_cancellation_email: String(send_notification) },
          });
          logStep("Scheduled cancellation", { subscriptionId: plan.sub.id, endsAt: plan.endsAt });
        } else {
          // Do not clear payment_failed_at or interfere with invoice/booking handling.
          await stripe.subscriptions.update(plan.sub.id, { metadata: { send_cancellation_email: String(send_notification) } });
          await stripe.subscriptions.cancel(plan.sub.id, { prorate: false, invoice_now: false });
        }
      }
    }
    const scheduled = plans.some(plan => plan.scheduled);
    const endsAt = Math.max(...plans.map(plan => plan.endsAt));

    // Email notification is now handled by the Stripe webhook (stripe-webhook function)
    // when the subscription.deleted event fires, preventing duplicate emails

    return new Response(
      JSON.stringify({ success: true, preview, scheduled, ends_at: new Date(endsAt * 1000).toISOString(), message: scheduled ? "Cancellation scheduled; member benefits remain until the paid week ends." : "Membership cancellation is immediate; no paid time remains." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
