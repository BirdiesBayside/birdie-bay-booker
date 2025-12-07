import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-TERMINAL] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const readerId = Deno.env.get("STRIPE_TERMINAL_READER_ID");
    if (!readerId) throw new Error("STRIPE_TERMINAL_READER_ID is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    const { action, amount, paymentIntentId, customerId, bookingId, items, description } = await req.json();
    logStep("Request received", { action, amount });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    if (action === "create_payment_intent") {
      // Create a payment intent for the terminal
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "aud",
        payment_method_types: ["card_present"],
        capture_method: "automatic",
        description: description || "POS Transaction",
        metadata: {
          customerId: customerId || "",
          bookingId: bookingId || "",
          items: JSON.stringify(items || []),
        },
      });

      logStep("Payment intent created", { paymentIntentId: paymentIntent.id });

      // Process the payment on the reader
      const processIntent = await stripe.terminal.readers.processPaymentIntent(
        readerId,
        { payment_intent: paymentIntent.id }
      );

      logStep("Payment processing started on reader", { readerId, status: processIntent.action?.status });

      return new Response(JSON.stringify({
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        readerStatus: processIntent.action?.status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "check_payment_status") {
      if (!paymentIntentId) throw new Error("Payment intent ID required");

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      logStep("Payment status checked", { status: paymentIntent.status });

      return new Response(JSON.stringify({
        success: true,
        status: paymentIntent.status,
        paid: paymentIntent.status === "succeeded",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "cancel_reader_action") {
      await stripe.terminal.readers.cancelAction(readerId);
      logStep("Reader action cancelled");

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "charge_saved_card") {
      if (!customerId) throw new Error("Customer ID required");
      
      // Get customer's Stripe customer ID from profile
      const { data: profile } = await supabaseClient
        .from('profiles')
        .select('email')
        .eq('user_id', customerId)
        .single();

      if (!profile?.email) throw new Error("Customer email not found");

      // Find Stripe customer
      const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
      if (customers.data.length === 0) throw new Error("No Stripe customer found");

      const stripeCustomerId = customers.data[0].id;

      // Get default payment method
      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: "card",
        limit: 1,
      });

      if (paymentMethods.data.length === 0) throw new Error("No saved payment method found");

      const paymentMethodId = paymentMethods.data[0].id;

      // Create and confirm payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "aud",
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: description || "POS Transaction - Customer Account",
        metadata: {
          customerId: customerId,
          bookingId: bookingId || "",
          items: JSON.stringify(items || []),
        },
      });

      logStep("Customer account charged", { paymentIntentId: paymentIntent.id, status: paymentIntent.status });

      return new Response(JSON.stringify({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        paid: paymentIntent.status === "succeeded",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    throw new Error(`Unknown action: ${action}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
