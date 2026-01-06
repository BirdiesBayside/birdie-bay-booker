import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-BOOKING-PAYMENT] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Use service role to verify payment - this runs after Stripe redirect
    // The booking_id is only known to the user who created it
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { bookingId } = await req.json();
    if (!bookingId) throw new Error("Missing bookingId");
    logStep("Request parsed", { bookingId });

    // Check if booking exists (using UUID provides security - only holder knows it)
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    // If already confirmed, return success
    if (booking.status === "confirmed") {
      logStep("Booking already confirmed", { bookingId });
      return new Response(JSON.stringify({ 
        success: true, 
        status: "confirmed",
        alreadyConfirmed: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find checkout sessions for this booking
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
    });

    const matchingSession = sessions.data.find(
      (s: Stripe.Checkout.Session) => s.metadata?.booking_id === bookingId && s.payment_status === "paid"
    );

    if (!matchingSession) {
      logStep("No paid session found for booking", { bookingId });
      return new Response(JSON.stringify({ 
        success: false, 
        status: "pending",
        message: "Payment not yet confirmed" 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    logStep("Found paid session", { 
      sessionId: matchingSession.id, 
      paymentIntent: matchingSession.payment_intent 
    });

    // Update booking to confirmed
    const { error: updateError } = await supabaseClient
      .from("bookings")
      .update({
        status: "confirmed",
        payment_method: "card",
        stripe_payment_intent_id: matchingSession.payment_intent as string,
      })
      .eq("id", bookingId);

    if (updateError) {
      logStep("Error updating booking", { error: updateError.message });
      throw new Error("Failed to update booking");
    }

    logStep("Booking confirmed successfully", { bookingId });

    // Send booking confirmation notification in background
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      
      fetch(`${supabaseUrl}/functions/v1/send-booking-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          booking_id: bookingId,
          notification_type: "confirmation",
        }),
      }).catch((err) => logStep("Notification error", { error: err.message }));
      
      logStep("Booking notification triggered");
    } catch (notificationError) {
      logStep("Failed to send booking notification", { error: notificationError });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      status: "confirmed" 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
