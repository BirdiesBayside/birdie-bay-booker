import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[RETRY-MEMBERSHIP-PAYMENT] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "no_customer",
          message: "No Stripe customer record found. Please update your card on file.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
    const customer = customers.data[0];
    const customerId = customer.id;

    // Determine which payment method to charge
    const defaultPmId =
      (customer.invoice_settings?.default_payment_method as string | null) ?? null;

    let paymentMethodId: string | null = defaultPmId;
    if (!paymentMethodId) {
      const pms = await stripe.paymentMethods.list({
        customer: customerId,
        type: "card",
        limit: 1,
      });
      paymentMethodId = pms.data[0]?.id ?? null;
    }

    if (!paymentMethodId) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "no_payment_method",
          message: "No card on file. Please add a new card to retry payment.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Find latest open invoice for this customer
    const openInvoices = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      limit: 1,
    });

    if (openInvoices.data.length === 0) {
      // Nothing to pay - clear flag defensively and report
      await supabaseAdmin
        .from("profiles")
        .update({ payment_failed_at: null })
        .eq("user_id", user.id);
      logStep("No open invoices found, cleared flag");
      return new Response(
        JSON.stringify({
          success: true,
          status: "no_open_invoice",
          message: "No outstanding invoice. Your membership is up to date.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    const invoice = openInvoices.data[0];
    logStep("Attempting to pay invoice", {
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      pm: paymentMethodId,
    });

    try {
      await stripe.invoices.pay(invoice.id, { payment_method: paymentMethodId });
      logStep("Invoice paid successfully", { invoiceId: invoice.id });

      // Webhook will clear payment_failed_at, but do it here too for instant UX
      await supabaseAdmin
        .from("profiles")
        .update({ payment_failed_at: null })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({
          success: true,
          status: "paid",
          message: "Payment successful! Your membership is active again.",
          amount: invoice.amount_due,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    } catch (payError: any) {
      const errMsg = payError?.message || String(payError);
      logStep("Payment failed", { error: errMsg });
      return new Response(
        JSON.stringify({
          success: false,
          status: "card_declined",
          message:
            payError?.raw?.message ||
            "Your card was declined. Please update your card and try again.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
