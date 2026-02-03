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

    const { bookingId, amount, description, paymentMethodId, mode } = await req.json();
    if (!bookingId || !amount) throw new Error("Missing bookingId or amount");
    logStep("Request parsed", { bookingId, amount, description, paymentMethodId, mode });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists in Stripe
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
      logStep("Found existing customer", { customerId });
    }

    // If a new payment method was provided (from Stripe Elements), use it
    if (paymentMethodId) {
      logStep("Using provided payment method", { paymentMethodId });
      
      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
        logStep("Created new customer", { customerId });
      }

      // Attach the payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
      
      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      logStep("Attached and set default payment method");

      // Charge using the new payment method
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency: "aud",
        customer: customerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: description || "Bay booking payment",
        metadata: {
          booking_id: bookingId,
          user_id: user.id,
        },
      });

      logStep("Payment successful with new card", { 
        paymentIntentId: paymentIntent.id, 
        status: paymentIntent.status 
      });

      // Get card details for response
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);

      // Update booking with payment info
      await supabaseClient
        .from("bookings")
        .update({
          payment_method: "card",
          stripe_payment_intent_id: paymentIntent.id,
          status: "confirmed",
        })
        .eq("id", bookingId);

      return new Response(JSON.stringify({ 
        success: true, 
        paymentIntentId: paymentIntent.id,
        cardBrand: pm.card?.brand,
        cardLast4: pm.card?.last4,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    
    // No new payment method - check for existing customer/cards
    if (!customerId) {
      // No Stripe customer - redirect to checkout
      logStep("No Stripe customer found, creating checkout session");
      
      const origin = req.headers.get("origin") || "https://hub.birdiesbayside.com.au";
      
      // Always use HTTPS URLs - for native apps, the WebView handles the redirect naturally
      const successUrl = `${origin}/booking-success?booking_id=${bookingId}`;
      const cancelUrl = `${origin}/booking?booking_cancelled=true&booking_id=${bookingId}`;
      
      const session = await stripe.checkout.sessions.create({
        customer_email: user.email,
        payment_method_types: ["card"],
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic",
          },
        },
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
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
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

    logStep("Found Stripe customer", { customerId });

    // Check for saved payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    if (paymentMethods.data.length === 0) {
      // No saved card - redirect to checkout
      logStep("No saved payment method, creating checkout session");
      
      const origin = req.headers.get("origin") || "https://hub.birdiesbayside.com.au";
      
      // Always use HTTPS URLs - for native apps, the WebView handles the redirect naturally
      const successUrl = `${origin}/booking-success?booking_id=${bookingId}`;
      const cancelUrl = `${origin}/booking?booking_cancelled=true&booking_id=${bookingId}`;
      
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        payment_method_options: {
          card: {
            request_three_d_secure: "automatic",
          },
        },
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
        payment_intent_data: {
          setup_future_usage: "off_session",
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
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
    logStep("ERROR", { message: error.message, code: error.code, type: error.type });
    
    // Handle Stripe card/payment errors with specific messages
    if (error.type === "StripeCardError" || error.code) {
      // Map common Stripe decline codes to user-friendly messages
      const declineMessages: Record<string, string> = {
        expired_card: "Your card has expired. Please update your payment method.",
        card_declined: "Your card was declined. Please try a different card.",
        insufficient_funds: "Your card has insufficient funds. Please try a different card.",
        incorrect_cvc: "The CVC code is incorrect. Please check and try again.",
        processing_error: "There was an error processing your card. Please try again.",
        incorrect_number: "The card number is incorrect. Please check and try again.",
        authentication_required: "Your card requires authentication. Please try again or use a different card.",
      };
      
      const friendlyMessage = declineMessages[error.code] || 
        error.message || 
        "Your card was declined. Please update your payment method.";
      
      return new Response(JSON.stringify({ 
        error: friendlyMessage,
        code: error.code || "card_error"
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
