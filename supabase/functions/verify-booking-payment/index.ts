import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-BOOKING-PAYMENT] ${step}${detailsStr}`);
};

// Auto-refund orphaned payment when booking was deleted or already confirmed
const refundOrphanedPayment = async (
  stripe: Stripe, 
  paymentIntentId: string, 
  reason: string
): Promise<boolean> => {
  try {
    logStep("Initiating auto-refund for orphaned payment", { paymentIntentId, reason });
    
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      reason: "duplicate",
    });
    
    logStep("Auto-refund successful", { refundId: refund.id, amount: refund.amount });
    return true;
  } catch (error: any) {
    logStep("Auto-refund failed", { error: error.message, paymentIntentId });
    return false;
  }
};

const triggerBookingConfirmation = async (bookingId: string) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing backend configuration for booking notification");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-booking-notification`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      booking_id: bookingId,
      notification_type: "confirmation",
    }),
  });

  const responseText = await response.text();
  let responseBody: any = responseText;
  try {
    responseBody = responseText ? JSON.parse(responseText) : null;
  } catch {
    // Keep raw text body for logging.
  }

  if (!response.ok) {
    logStep("Booking notification failed", {
      bookingId,
      status: response.status,
      response: responseBody,
    });
    return { success: false, status: response.status, response: responseBody };
  }

  logStep("Booking notification completed", { bookingId, response: responseBody });
  return { success: true, status: response.status, response: responseBody };
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if booking exists (using UUID provides security - only holder knows it)
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select(`
        id,
        booking_date,
        start_time,
        end_time,
        duration_hours,
        total_price,
        status,
        stripe_payment_intent_id,
        bay:bays(name, bay_number)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    // CASE 1: Booking was deleted (user retried and replaced it)
    if (bookingError || !booking) {
      logStep("Booking not found - checking for orphaned payment to refund", { bookingId });
      
      // Find any paid session for this booking ID and refund it
      const sessions = await stripe.checkout.sessions.list({ limit: 50 });
      const paidSession = sessions.data.find(
        (s: Stripe.Checkout.Session) => 
          s.metadata?.booking_id === bookingId && s.payment_status === "paid"
      );
      
      if (paidSession?.payment_intent) {
        const refunded = await refundOrphanedPayment(
          stripe, 
          paidSession.payment_intent as string,
          "Booking was deleted/replaced before payment confirmation"
        );
        
        return new Response(JSON.stringify({ 
          success: false, 
          status: "refunded",
          message: refunded 
            ? "This booking was replaced. Your payment has been automatically refunded."
            : "Booking not found. Please contact support regarding your payment."
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      
      throw new Error("Booking not found");
    }

    // Format booking for response
    const bookingDetails = {
      ...booking,
      bay: Array.isArray(booking.bay) ? booking.bay[0] : booking.bay,
    };

    // CASE 2: Booking already confirmed by another payment (race condition)
    if (booking.status === "confirmed") {
      logStep("Booking already confirmed", { bookingId });
      
      // Check if there's a DIFFERENT paid session trying to confirm the same booking
      const sessions = await stripe.checkout.sessions.list({ limit: 50 });
      const paidSessions = sessions.data.filter(
        (s: Stripe.Checkout.Session) => 
          s.metadata?.booking_id === bookingId && s.payment_status === "paid"
      );
      
      // If multiple paid sessions exist, refund any that don't match the stored payment intent
      if (paidSessions.length > 1 && booking.stripe_payment_intent_id) {
        for (const session of paidSessions) {
          const sessionPaymentIntent = session.payment_intent as string;
          if (sessionPaymentIntent && sessionPaymentIntent !== booking.stripe_payment_intent_id) {
            logStep("Found duplicate payment for already-confirmed booking", { 
              orphanedIntent: sessionPaymentIntent,
              confirmedIntent: booking.stripe_payment_intent_id 
            });
            await refundOrphanedPayment(
              stripe, 
              sessionPaymentIntent,
              "Duplicate payment - booking already confirmed by another payment"
            );
          }
        }
      }

      const notificationResult = await triggerBookingConfirmation(bookingId);
      
      return new Response(JSON.stringify({ 
        success: true, 
        status: "confirmed",
        alreadyConfirmed: true,
        notification: notificationResult,
        booking: bookingDetails
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Find checkout sessions for this booking (increased limit for high traffic periods)
    const sessions = await stripe.checkout.sessions.list({
      limit: 50,
    });

    // Look for any session matching this booking
    const matchingSessions = sessions.data.filter(
      (s: Stripe.Checkout.Session) => s.metadata?.booking_id === bookingId
    );

    // Check for paid session first
    const paidSession = matchingSessions.find(
      (s: Stripe.Checkout.Session) => s.payment_status === "paid"
    );
    
    if (!paidSession) {
      // Check if there's a failed or expired session
      const failedSession = matchingSessions.find(
        (s: Stripe.Checkout.Session) => 
          s.payment_status === "unpaid" && (s.status === "expired" || s.status === "complete")
      );
      
      // Check for payment intent failures
      const sessionWithIntent = matchingSessions.find(
        (s: Stripe.Checkout.Session) => s.payment_intent
      );
      let paymentFailed = false;
      let failureReason = "";
      
      if (sessionWithIntent?.payment_intent) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(
            sessionWithIntent.payment_intent as string
          );
          if (paymentIntent.status === "requires_payment_method" || 
              paymentIntent.status === "canceled") {
            paymentFailed = true;
            failureReason = paymentIntent.last_payment_error?.message || "Card was declined";
            logStep("Payment intent failed", { 
              status: paymentIntent.status, 
              reason: failureReason 
            });
          }
        } catch (e) {
          logStep("Could not retrieve payment intent", { error: (e as Error).message });
        }
      }
      
      if (paymentFailed || failedSession) {
        logStep("Payment failed for booking", { bookingId, failureReason });
        return new Response(JSON.stringify({ 
          success: false, 
          status: "failed",
          message: failureReason || "Payment was not completed",
          booking: bookingDetails
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      
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
    
    const matchingSession = paidSession;

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

    // Send booking confirmation notification now. The notification function is idempotent,
    // so this is safe even if the Stripe webhook races this verifier.
    let notificationResult: any = null;
    try {
      notificationResult = await triggerBookingConfirmation(bookingId);
    } catch (notificationError) {
      notificationResult = {
        success: false,
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      };
      logStep("Failed to send booking notification", notificationResult);
    }

    // Refetch booking to get updated status and bay details
    const { data: confirmedBooking } = await supabaseClient
      .from("bookings")
      .select(`
        id,
        booking_date,
        start_time,
        end_time,
        duration_hours,
        total_price,
        status,
        bay:bays(name, bay_number)
      `)
      .eq("id", bookingId)
      .maybeSingle();

    const confirmedBookingDetails = confirmedBooking ? {
      ...confirmedBooking,
      bay: Array.isArray(confirmedBooking.bay) ? confirmedBooking.bay[0] : confirmedBooking.bay,
    } : null;

    return new Response(JSON.stringify({ 
      success: true, 
      status: "confirmed",
      notification: notificationResult,
      booking: confirmedBookingDetails
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
