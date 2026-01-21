import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    // Create client with user's token for auth
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Create admin client for operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get authenticated user
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const { booking_id, new_date, new_start_time, new_bay_id } = await req.json();

    if (!booking_id || !new_date || !new_start_time || !new_bay_id) {
      throw new Error("Missing required fields: booking_id, new_date, new_start_time, new_bay_id");
    }

    console.log("[RESCHEDULE] Request:", { booking_id, new_date, new_start_time, new_bay_id });

    // Fetch the current booking
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select("*")
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error("Booking not found");
    }

    // Verify user owns this booking
    if (booking.user_id !== user.id) {
      throw new Error("You can only reschedule your own bookings");
    }

    // Verify booking is confirmed (not cancelled or pending)
    if (booking.status !== "confirmed") {
      throw new Error("Only confirmed bookings can be rescheduled");
    }

    // Calculate new end time based on duration
    const [startHours, startMinutes] = new_start_time.split(":").map(Number);
    const endHours = startHours + booking.duration_hours;
    const new_end_time = `${endHours.toString().padStart(2, "0")}:${startMinutes.toString().padStart(2, "0")}`;

    console.log("[RESCHEDULE] Calculated end time:", new_end_time);

    // Check for overlapping bookings (excluding current booking)
    const { data: overlappingBookings, error: overlapError } = await supabaseAdmin
      .from("bookings")
      .select("id")
      .eq("bay_id", new_bay_id)
      .eq("booking_date", new_date)
      .in("status", ["confirmed", "pending"])
      .neq("id", booking_id)
      .lt("start_time", new_end_time)
      .gt("end_time", new_start_time);

    if (overlapError) {
      console.error("[RESCHEDULE] Overlap check error:", overlapError);
      throw new Error("Failed to check availability");
    }

    if (overlappingBookings && overlappingBookings.length > 0) {
      throw new Error("This time slot is no longer available. Please choose a different time or bay.");
    }

    // Check for bay blocks
    const { data: blocks, error: blockError } = await supabaseAdmin
      .from("bay_blocks")
      .select("id")
      .eq("bay_id", new_bay_id)
      .eq("block_date", new_date)
      .lt("start_time", new_end_time)
      .gt("end_time", new_start_time);

    if (blockError) {
      console.error("[RESCHEDULE] Block check error:", blockError);
      throw new Error("Failed to check availability");
    }

    if (blocks && blocks.length > 0) {
      throw new Error("This time slot is blocked by the facility. Please choose a different time.");
    }

    // Update the booking atomically
    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update({
        booking_date: new_date,
        start_time: new_start_time,
        end_time: new_end_time,
        bay_id: new_bay_id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", booking_id)
      .select()
      .single();

    if (updateError) {
      console.error("[RESCHEDULE] Update error:", updateError);
      // Check if it's an overlap error from the trigger
      if (updateError.message?.includes("overlap") || updateError.message?.includes("blocked")) {
        throw new Error("This time slot was just taken. Please try a different time.");
      }
      throw new Error("Failed to reschedule booking");
    }

    console.log("[RESCHEDULE] Success:", updatedBooking);

    // Optionally send notification
    try {
      await supabaseAdmin.functions.invoke("send-booking-notification", {
        body: {
          booking_id: booking_id,
          notification_type: "reschedule",
        },
      });
    } catch (notifyError) {
      console.error("[RESCHEDULE] Notification failed (non-blocking):", notifyError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        booking: updatedBooking,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    console.error("[RESCHEDULE] Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
