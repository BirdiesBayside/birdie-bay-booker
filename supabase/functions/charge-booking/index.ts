import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHARGE-BOOKING] ${step}${detailsStr}`);
};

serve(async (req) => {
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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const { bookingId, amount, description } = await req.json();
    if (!bookingId || !amount) throw new Error("Missing bookingId or amount");
    logStep("Request parsed", { bookingId, amount, description });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists in Stripe
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (customers.data.length === 0) {
      // No Stripe customer - redirect to checkout
      logStep("No Stripe customer found, creating checkout session");
      
      const origin = req.headers.get("origin") || "https://hltrcuypuxhetcjyvedl.lovable.app";
      
      const session = await stripe.checkout.sessions.create({
        customer_email: user.email,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: "Bay Booking",
                description: description || "Golf simulator bay booking",
              },
              unit_amount: Math.round(amount * 100), // Convert to cents
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        // Save card for future bookings
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        success_url: `${origin}/booking-success?booking_id=${bookingId}`,
        cancel_url: `${origin}/booking?booking_cancelled=true&booking_id=${bookingId}`,
        metadata: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });

      logStep("Checkout session created", { sessionId: session.id });
      
      return new Response(JSON.stringify({ 
        requiresCheckout: true, 
        checkoutUrl: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    // Check for saved payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      // No saved card - redirect to checkout
      logStep("No saved payment method, creating checkout session");
      
      const origin = req.headers.get("origin") || "https://hltrcuypuxhetcjyvedl.lovable.app";
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "aud",
              product_data: {
                name: "Bay Booking",
                description: description || "Golf simulator bay booking",
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        // Save card for future bookings
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        success_url: `${origin}/booking-success?booking_id=${bookingId}`,
        cancel_url: `${origin}/booking?booking_cancelled=true&booking_id=${bookingId}`,
        metadata: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });

      logStep("Checkout session created for existing customer", { sessionId: session.id });
      
      return new Response(JSON.stringify({ 
        requiresCheckout: true, 
        checkoutUrl: session.url 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Charge the saved card
    const paymentMethod = paymentMethods.data[0];
    logStep("Using saved payment method", { 
      paymentMethodId: paymentMethod.id, 
      brand: paymentMethod.card?.brand,
      last4: paymentMethod.card?.last4 
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: "aud",
      customer: customerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: description || "Bay booking payment",
      metadata: {
        booking_id: bookingId,
        user_id: user.id,
      },
    });

    logStep("Payment successful", { 
      paymentIntentId: paymentIntent.id, 
      status: paymentIntent.status 
    });

    // Update booking with payment info
    const { error: updateError } = await supabaseClient
      .from("bookings")
      .update({
        payment_method: "card",
        stripe_payment_intent_id: paymentIntent.id,
        status: "confirmed",
      })
      .eq("id", bookingId);

    if (updateError) {
      logStep("Warning: Failed to update booking", { error: updateError.message });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      paymentIntentId: paymentIntent.id,
      cardBrand: paymentMethod.card?.brand,
      cardLast4: paymentMethod.card?.last4,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    logStep("ERROR", { message: error.message, code: error.code });
    
    // Handle card declined or payment errors
    if (error.type === "StripeCardError") {
      return new Response(JSON.stringify({ 
        error: "Your card was declined. Please update your payment method.",
        code: "card_declined"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
