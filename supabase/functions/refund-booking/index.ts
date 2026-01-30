import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RefundRequest {
  booking_id: string;
  send_notification: boolean;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[REFUND-BOOKING] Function started");

    // Initialize Supabase client with service role for admin operations
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Verify admin authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    const user = userData.user;
    if (!user) throw new Error("User not authenticated");

    // Check if user is admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      throw new Error("Unauthorized: Admin access required");
    }

    console.log("[REFUND-BOOKING] Admin verified:", user.id);

    const { booking_id, send_notification }: RefundRequest = await req.json();
    console.log("[REFUND-BOOKING] Processing refund for booking:", booking_id);

    // Fetch booking details
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Booking not found: ${bookingError?.message}`);
    }

    console.log("[REFUND-BOOKING] Booking found:", {
      id: booking.id,
      payment_intent: booking.stripe_payment_intent_id,
      payment_method: booking.payment_method,
      total_price: booking.total_price
    });

    let refundResult = null;
    let creditRefundResult = null;

    // Process Stripe refund if payment intent exists (check for both "stripe" and "card" payment methods)
    if (booking.stripe_payment_intent_id && (booking.payment_method === "stripe" || booking.payment_method === "card")) {
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        throw new Error("STRIPE_SECRET_KEY is not configured");
      }

      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

      console.log("[REFUND-BOOKING] Creating Stripe refund for payment intent:", booking.stripe_payment_intent_id);

      const refund = await stripe.refunds.create({
        payment_intent: booking.stripe_payment_intent_id,
        reason: "requested_by_customer",
      });

      refundResult = {
        refund_id: refund.id,
        amount: refund.amount,
        status: refund.status,
      };

      console.log("[REFUND-BOOKING] Stripe refund created:", refundResult);
    } 
    
    // Process credit balance refund for "balance" or "partial" payments
    if (booking.payment_method === "balance" || booking.payment_method === "partial") {
      const refundAmount = parseFloat(booking.total_price) || 0;
      
      if (refundAmount > 0) {
        console.log("[REFUND-BOOKING] Refunding credit balance:", refundAmount, "to user:", booking.user_id);
        
        // Get current deposit balance
        const { data: profile, error: profileError } = await supabaseClient
          .from("profiles")
          .select("deposit_balance")
          .eq("user_id", booking.user_id)
          .single();
        
        if (profileError) {
          throw new Error(`Failed to get user profile: ${profileError.message}`);
        }
        
        const currentBalance = parseFloat(profile?.deposit_balance) || 0;
        const newBalance = currentBalance + refundAmount;
        
        // Update deposit balance
        const { error: updateBalanceError } = await supabaseClient
          .from("profiles")
          .update({ deposit_balance: newBalance })
          .eq("user_id", booking.user_id);
        
        if (updateBalanceError) {
          throw new Error(`Failed to refund credit balance: ${updateBalanceError.message}`);
        }
        
        creditRefundResult = {
          previous_balance: currentBalance,
          refund_amount: refundAmount,
          new_balance: newBalance,
        };
        
        console.log("[REFUND-BOOKING] Credit balance refunded:", creditRefundResult);
      }
    } else if (!booking.stripe_payment_intent_id) {
      console.log("[REFUND-BOOKING] No payment to refund (payment_method:", booking.payment_method, ")");
    }

    // Update booking status to cancelled
    const { error: updateError } = await supabaseClient
      .from("bookings")
      .update({ 
        status: "cancelled",
        updated_at: new Date().toISOString()
      })
      .eq("id", booking_id);

    if (updateError) {
      throw new Error(`Failed to update booking status: ${updateError.message}`);
    }

    console.log("[REFUND-BOOKING] Booking status updated to cancelled");

    // Send cancellation notification if requested
    if (send_notification) {
      console.log("[REFUND-BOOKING] Sending cancellation notification");
      
      try {
        const notificationResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-notification`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              booking_id: booking_id,
              notification_type: "cancellation",
            }),
          }
        );

        if (!notificationResponse.ok) {
          console.error("[REFUND-BOOKING] Notification failed:", await notificationResponse.text());
        } else {
          console.log("[REFUND-BOOKING] Cancellation notification sent");
        }
      } catch (notifError) {
        console.error("[REFUND-BOOKING] Notification error:", notifError);
        // Don't fail the whole operation if notification fails
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        booking_id,
        refund: refundResult,
        credit_refund: creditRefundResult,
        notification_sent: send_notification,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[REFUND-BOOKING] Error:", errorMessage);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
