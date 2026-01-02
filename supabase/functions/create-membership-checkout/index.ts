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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Generate idempotency key based on user ID and tier to prevent duplicate subscriptions
    // This key is valid for 24 hours in Stripe
    const idempotencyKey = `membership_${user.id}_${tierKey}_${new Date().toISOString().split('T')[0]}`;
    logStep("Using idempotency key", { idempotencyKey });

    // Check if customer already exists
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Existing customer found", { customerId });

      // Check for existing active subscription with the SAME price
      const existingSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
      });

      // Check if already subscribed to the requested tier
      for (const sub of existingSubscriptions.data) {
        const existingPriceId = sub.items.data[0]?.price?.id;
        if (existingPriceId === priceId) {
          logStep("Already subscribed to this tier", { subscriptionId: sub.id, priceId });
          return new Response(JSON.stringify({ 
            success: true, 
            subscriptionId: sub.id,
            tierKey: tierKey,
            message: "Already subscribed to this tier"
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      }

      // Check if customer has a saved payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });

      if (paymentMethods.data.length > 0) {
        // Use the saved payment method to create subscription directly
        const defaultPaymentMethod = paymentMethods.data[0].id;
        logStep("Using saved payment method", { paymentMethodId: defaultPaymentMethod });

        // Cancel existing subscriptions first
        if (existingSubscriptions.data.length > 0) {
          for (const sub of existingSubscriptions.data) {
            await stripe.subscriptions.cancel(sub.id, { prorate: true });
            logStep("Cancelled existing subscription", { subscriptionId: sub.id });
          }
        }

        // Create subscription directly using saved payment method with idempotency key
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

    const origin = req.headers.get("origin") || "https://birdies-booking.lovable.app";

    const session = await stripe.checkout.sessions.create({
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
    }, {
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