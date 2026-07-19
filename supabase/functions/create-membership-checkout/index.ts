import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-MEMBERSHIP-CHECKOUT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { priceId, tierKey } = await req.json();
    if (!priceId || !tierKey) throw new Error("Missing priceId or tierKey");
    logStep("Request body parsed", { priceId, tierKey });

    logStep("Processing membership checkout", { userId: user.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Fix A: bucketed idempotency key (10-min window). Prevents double-firing
    // when the user rapid-clicks or the request retries — same tier within 10
    // minutes collapses to a single Stripe subscription creation.
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const idempotencyKey = `membership_v5_${user.id}_${tierKey}_${priceId}_${bucket}`;
    logStep("Using idempotency key", { idempotencyKey });

    // Fix D: search ALL Stripe customers with this email, not just one.
    // Historically a second Stripe customer could be created (e.g. via a
    // Checkout Session without a pre-existing customer), leaving the old
    // customer's subscription silently billing forever. We now gather every
    // customer for the email and act across all of them.
    const customersList = await stripe.customers.list({ email: user.email, limit: 20 });
    const allCustomers = customersList.data;
    let customerId: string | undefined;

    if (allCustomers.length > 0) {
      // Prefer the customer that already has a saved card; else the newest.
      customerId = allCustomers[0].id;
      logStep("Existing customer(s) found", { count: allCustomers.length, primaryCustomerId: customerId, allIds: allCustomers.map(c => c.id) });

      // Aggregate active subscriptions across ALL customers for this email.
      const allActiveSubs: Array<Stripe.Subscription> = [];
      for (const c of allCustomers) {
        const subs = await stripe.subscriptions.list({ customer: c.id, status: "active" });
        allActiveSubs.push(...subs.data);
      }
      logStep("Active subscriptions across all customers", { count: allActiveSubs.length });

      // Already subscribed to the requested tier on any customer → no-op.
      for (const sub of allActiveSubs) {
        const existingPriceId = sub.items.data[0]?.price?.id;
        if (existingPriceId === priceId) {
          logStep("Already subscribed to this tier", { subscriptionId: sub.id, priceId, customer: sub.customer });
          return new Response(JSON.stringify({
            success: true,
            subscriptionId: sub.id,
            tierKey: tierKey,
            message: "Already subscribed to this tier",
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      }

      // Find a saved payment method on any customer. Prefer the customer that
      // already has one so the new sub reuses their existing card.
      let defaultPaymentMethod: string | undefined;
      for (const c of allCustomers) {
        const pms = await stripe.paymentMethods.list({ customer: c.id, type: "card" });
        if (pms.data.length > 0) {
          defaultPaymentMethod = pms.data[0].id;
          customerId = c.id;
          logStep("Using saved payment method", { paymentMethodId: defaultPaymentMethod, customerId });
          break;
        }
      }

      if (defaultPaymentMethod) {
        // Cancel EVERY active subscription across ALL customers so we can
        // never leave a duplicate tier silently billing. Refund recent
        // accidental charges (created <10min ago) as duplicates.
        for (const sub of allActiveSubs) {
          const ageMs = Date.now() - (sub.created * 1000);
          if (ageMs < 10 * 60 * 1000) {
            try {
              const invoices = await stripe.invoices.list({ subscription: sub.id, limit: 5 });
              for (const inv of invoices.data) {
                if (inv.status === "paid" && (inv as any).charge && inv.amount_paid > 0) {
                  const chargeRef = (inv as any).charge;
                  const chargeId = typeof chargeRef === "string" ? chargeRef : chargeRef.id;
                  const refund = await stripe.refunds.create({ charge: chargeId, reason: "duplicate" });
                  logStep("Refunded accidental sub charge on tier switch", {
                    subscriptionId: sub.id, chargeId, refundId: refund.id, ageMs,
                  });
                }
              }
            } catch (refundErr) {
              logStep("WARN: refund on tier switch failed", { error: String(refundErr) });
            }
          }
          try {
            await stripe.subscriptions.cancel(sub.id, { prorate: true });
            logStep("Cancelled existing subscription", { subscriptionId: sub.id, customer: sub.customer });
          } catch (cancelErr) {
            logStep("WARN: cancel failed", { subscriptionId: sub.id, error: String(cancelErr) });
          }
        }


        // Create subscription - charges immediately
        const subscription = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          default_payment_method: defaultPaymentMethod,
          metadata: {
            user_id: user.id,
            tier_key: tierKey,
          },
        }, {
          idempotencyKey: idempotencyKey,
        });

        logStep("Subscription created directly", { subscriptionId: subscription.id });

        return new Response(JSON.stringify({ 
          success: true, 
          subscriptionId: subscription.id,
          tierKey: tierKey,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
    }

    // No saved payment method - redirect to Stripe Checkout
    logStep("No saved payment method, redirecting to checkout");

    const origin = req.headers.get("origin") || "https://hub.birdiesbayside.com.au";

    const checkoutParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${origin}/membership?success=true&tier=${tierKey}`,
      cancel_url: `${origin}/membership?cancelled=true`,
      metadata: {
        user_id: user.id,
        tier_key: tierKey,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          tier_key: tierKey,
        },
      },
    };

    const session = await stripe.checkout.sessions.create(checkoutParams, {
      idempotencyKey: `checkout_${idempotencyKey}`,
    });

    logStep("Checkout session created", { sessionId: session.id });

    return new Response(JSON.stringify({ url: session.url }), {
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
