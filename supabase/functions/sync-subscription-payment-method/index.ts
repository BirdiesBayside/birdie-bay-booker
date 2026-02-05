import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SYNC-SUBSCRIPTION-PM] ${step}${detailsStr}`);
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
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Find the customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(
        JSON.stringify({ success: true, message: "No customer found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const customerId = customers.data[0].id;
    logStep("Found customer", { customerId });

    // Get the customer's payment methods (most recent first)
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });

    if (paymentMethods.data.length === 0) {
      logStep("No payment methods found");
      return new Response(
        JSON.stringify({ success: true, message: "No payment methods found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const latestPaymentMethod = paymentMethods.data[0];
    logStep("Found latest payment method", { 
      paymentMethodId: latestPaymentMethod.id,
      brand: latestPaymentMethod.card?.brand,
      last4: latestPaymentMethod.card?.last4
    });

    // Update customer's default payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: latestPaymentMethod.id },
    });
    logStep("Updated customer default payment method");

    // Get all active subscriptions and update them
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    let updatedCount = 0;
    for (const sub of subscriptions.data) {
      await stripe.subscriptions.update(sub.id, {
        default_payment_method: latestPaymentMethod.id,
      });
      logStep("Updated subscription payment method", { subscriptionId: sub.id });
      updatedCount++;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        updatedSubscriptions: updatedCount,
        paymentMethod: {
          brand: latestPaymentMethod.card?.brand,
          last4: latestPaymentMethod.card?.last4,
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
