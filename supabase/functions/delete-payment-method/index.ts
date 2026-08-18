import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[DELETE-PAYMENT-METHOD] ${step}${detailsStr}`);
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

    const { paymentMethodId } = await req.json();
    if (!paymentMethodId) throw new Error("Payment method ID is required");
    logStep("Payment method to delete", { paymentMethodId });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    // Verify the payment method belongs to this user's customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      throw new Error("No customer found for this user");
    }

    const customer = customers.data[0];
    const customerId = customer.id;
    logStep("Found customer", { customerId });

    // Get the payment method to verify ownership
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (paymentMethod.customer !== customerId) {
      throw new Error("Payment method does not belong to this customer");
    }

    // Server-side guard: never detach the card an active subscription depends on
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    if (subscriptions.data.length > 0) {
      const customerDefault =
        typeof customer.invoice_settings?.default_payment_method === "string"
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings?.default_payment_method?.id;

      const subDefaults = subscriptions.data.map((s) =>
        typeof s.default_payment_method === "string"
          ? s.default_payment_method
          : s.default_payment_method?.id
      );

      const isInUse =
        paymentMethodId === customerDefault || subDefaults.includes(paymentMethodId);

      // Also block removing the last remaining card while a subscription is active
      const remainingCards = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
      });
      const isLastCard = remainingCards.data.length <= 1;

      if (isInUse || isLastCard) {
        logStep("Blocked deletion", { isInUse, isLastCard });
        return new Response(
          JSON.stringify({
            error: isInUse
              ? "This card is currently paying for your membership. Add another card and make it the default first, then remove this one."
              : "This is the only card on your account and your membership needs one. Add another card first, then remove this one.",
            code: isInUse ? "in_use_by_subscription" : "last_card",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }
    }

    // Detach the payment method
    await stripe.paymentMethods.detach(paymentMethodId);
    logStep("Payment method deleted successfully");

    return new Response(
      JSON.stringify({ success: true }),
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