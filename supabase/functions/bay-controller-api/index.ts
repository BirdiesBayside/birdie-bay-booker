import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bay-number, x-app-version",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const bayNumber = parseInt(req.headers.get("x-bay-number") || url.searchParams.get("bay") || "0");
    const appVersion = req.headers.get("x-app-version") || "unknown";

    console.log(`Bay Controller API - Action: ${action}, Bay: ${bayNumber}, Version: ${appVersion}`);

    if (!bayNumber || bayNumber < 1 || bayNumber > 6) {
      return new Response(
        JSON.stringify({ error: "Invalid bay number. Must be 1-6." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the bay ID from bay number
    const { data: bay, error: bayError } = await supabase
      .from("bays")
      .select("id, name")
      .eq("bay_number", bayNumber)
      .single();

    if (bayError || !bay) {
      console.error("Bay lookup error:", bayError);
      return new Response(
        JSON.stringify({ error: "Bay not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle different actions
    switch (action) {
      case "heartbeat": {
        // Update or insert device status
        const { error: upsertError } = await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bay.id,
            is_online: true,
            last_seen: new Date().toISOString(),
            app_version: appVersion,
          }, { onConflict: "bay_id" });

        if (upsertError) {
          console.error("Heartbeat upsert error:", upsertError);
        }

        return new Response(
          JSON.stringify({ success: true, timestamp: new Date().toISOString() }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "bookings":
      default: {
        // Update device status
        await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bay.id,
            is_online: true,
            last_seen: new Date().toISOString(),
            app_version: appVersion,
          }, { onConflict: "bay_id" });

        // Get current date and time in Australia/Sydney timezone
        const now = new Date();
        const sydneyOptions = { timeZone: 'Australia/Sydney' };
        const sydneyDateStr = now.toLocaleDateString('en-CA', sydneyOptions); // "YYYY-MM-DD"
        const sydneyTimeStr = now.toLocaleTimeString('en-GB', { ...sydneyOptions, hour12: false }); // "HH:MM:SS"
        
        console.log(`Server UTC time: ${now.toISOString()}, Sydney date: ${sydneyDateStr}, Sydney time: ${sydneyTimeStr}`);

        // Fetch bookings for this bay from today onwards
        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select(`
            id,
            booking_date,
            start_time,
            end_time,
            duration_hours,
            player_count,
            status,
            user_id
          `)
          .eq("bay_id", bay.id)
          .eq("status", "confirmed")
          .gte("booking_date", sydneyDateStr)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true });

        // Filter out past bookings for today (only keep bookings that haven't ended yet)
        const filteredBookings = (bookings || []).filter((booking: any) => {
          if (booking.booking_date > sydneyDateStr) {
            // Future date - always include
            return true;
          }
          // Today's date - only include if booking hasn't ended yet
          return booking.end_time > sydneyTimeStr;
        });

        if (bookingsError) {
          console.error("Bookings fetch error:", bookingsError);
          return new Response(
            JSON.stringify({ error: "Failed to fetch bookings" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch customer names for each booking
        const userIds = [...new Set(filteredBookings.map((b: any) => b.user_id))];
        let profilesMap: Record<string, { first_name: string; last_name: string }> = {};
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", userIds);
          
          if (profiles) {
            profiles.forEach((p: any) => {
              profilesMap[p.user_id] = { first_name: p.first_name, last_name: p.last_name };
            });
          }
        }

        // Transform bookings to include customer_name
        const bookingsWithNames = filteredBookings.map((booking: any) => {
          const profile = profilesMap[booking.user_id];
          return {
            id: booking.id,
            booking_date: booking.booking_date,
            start_time: booking.start_time,
            end_time: booking.end_time,
            duration_hours: booking.duration_hours,
            player_count: booking.player_count,
            status: booking.status,
            customer_name: profile 
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
              : 'Unknown',
          };
        });

        console.log(`Returning ${filteredBookings.length} bookings for bay ${bayNumber} (filtered from ${bookings?.length || 0})`);

        return new Response(
          JSON.stringify({
            bay: {
              id: bay.id,
              number: bayNumber,
              name: bay.name,
            },
            bookings: bookingsWithNames,
            server_time: new Date().toISOString(),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
  } catch (error: unknown) {
    console.error("Bay Controller API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
