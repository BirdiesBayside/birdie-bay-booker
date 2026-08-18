import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GET-PAYMENT-METHODS] ${step}${detailsStr}`);
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

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found");
      return new Response(
        JSON.stringify({ paymentMethods: [], hasPaymentMethod: false }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    const customer = customers.data[0];
    const customerId = customer.id;
    logStep("Found customer", { customerId });

    // Determine the REAL default payment method (customer default, else active subscription default)
    let defaultPaymentMethodId: string | null =
      (typeof customer.invoice_settings?.default_payment_method === "string"
        ? customer.invoice_settings.default_payment_method
        : customer.invoice_settings?.default_payment_method?.id) || null;

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });
    const subscriptionPaymentMethodIds = subscriptions.data
      .map((s) =>
        typeof s.default_payment_method === "string"
          ? s.default_payment_method
          : s.default_payment_method?.id
      )
      .filter((id): id is string => !!id);

    if (!defaultPaymentMethodId && subscriptionPaymentMethodIds.length > 0) {
      defaultPaymentMethodId = subscriptionPaymentMethodIds[0];
    }

    // Get all payment methods (cards and link)
    const cardMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });
    
    const linkMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "link",
    });
    
    const allMethods = [...cardMethods.data, ...linkMethods.data];
    logStep("Retrieved payment methods", { 
      cards: cardMethods.data.length, 
      link: linkMethods.data.length,
      total: allMethods.length,
      defaultPaymentMethodId,
      hasActiveSubscription: subscriptions.data.length > 0,
    });

    const formattedMethods = allMethods.map((pm: Stripe.PaymentMethod) => {
      if (pm.type === "link") {
        return {
          id: pm.id,
          type: "link",
          brand: "link",
          last4: pm.link?.email?.slice(-4) || "****",
          email: pm.link?.email,
        };
      }
      return {
        id: pm.id,
        type: "card",
        brand: pm.card?.brand || "unknown",
        last4: pm.card?.last4 || "****",
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      };
    });

    return new Response(
      JSON.stringify({
        paymentMethods: formattedMethods,
        hasPaymentMethod: formattedMethods.length > 0,
        defaultPaymentMethodId,
        subscriptionPaymentMethodIds,
        hasActiveSubscription: subscriptions.data.length > 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
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
