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

      case "log": {
        // Handle logging from bay controller apps
        const body = await req.json();
        const logs = Array.isArray(body.logs) ? body.logs : [body];
        
        console.log(`Received ${logs.length} log entries from bay ${bayNumber}`);
        
        const logEntries = logs.map((log: any) => ({
          bay_number: bayNumber,
          event_type: log.event_type || 'unknown',
          event_level: log.event_level || 'info',
          message: log.message || '',
          details: log.details || {},
          booking_id: log.booking_id || null,
          app_version: appVersion,
        }));
        
        const { error: insertError } = await supabase
          .from("bay_controller_logs")
          .insert(logEntries);
        
        if (insertError) {
          console.error("Log insert error:", insertError);
          return new Response(
            JSON.stringify({ error: "Failed to store logs", details: insertError.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ success: true, count: logEntries.length }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "bookings":
      default: {
        // Update device status and get current control_mode
        const { data: deviceData } = await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bay.id,
            is_online: true,
            last_seen: new Date().toISOString(),
            app_version: appVersion,
          }, { onConflict: "bay_id" })
          .select("control_mode")
          .single();

        // Get timezone from system settings
        const { data: settings } = await supabase
          .from("system_settings")
          .select("timezone")
          .eq("id", "global")
          .single();
        
        const timezone = settings?.timezone || 'Australia/Sydney';

        // Get current date and time in configured timezone
        const now = new Date();
        const tzOptions = { timeZone: timezone };
        const localDateStr = now.toLocaleDateString('en-CA', tzOptions); // "YYYY-MM-DD"
        const localTimeStr = now.toLocaleTimeString('en-GB', { ...tzOptions, hour12: false }); // "HH:MM:SS"
        
        console.log(`Server UTC time: ${now.toISOString()}, Timezone: ${timezone}, Local date: ${localDateStr}, Local time: ${localTimeStr}`);

        // Fetch bookings for this bay from today onwards
        // Include both confirmed and pending bookings (exclude cancelled only)
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
          .in("status", ["confirmed", "pending"])
          .gte("booking_date", localDateStr)
          .order("booking_date", { ascending: true })
          .order("start_time", { ascending: true });

        // Filter out past bookings for today (only keep bookings that haven't ended yet)
        const filteredBookings = (bookings || []).filter((booking: any) => {
          if (booking.booking_date > localDateStr) {
            // Future date - always include
            return true;
          }
          // Today's date - only include if booking hasn't ended yet
          return booking.end_time > localTimeStr;
        });

        if (bookingsError) {
          console.error("Bookings fetch error:", bookingsError);
          return new Response(
            JSON.stringify({ error: "Failed to fetch bookings" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Fetch customer names and SGT info for each booking
        const userIds = [...new Set(filteredBookings.map((b: any) => b.user_id))];
        let profilesMap: Record<string, { first_name: string; last_name: string; sgt_user_id: number | null }> = {};
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, sgt_user_id")
            .in("user_id", userIds);
          
          if (profiles) {
            profiles.forEach((p: any) => {
              profilesMap[p.user_id] = { 
                first_name: p.first_name, 
                last_name: p.last_name,
                sgt_user_id: p.sgt_user_id 
              };
            });
          }
        }

        // Fetch SGT member info for users with sgt_user_id
        const sgtUserIds = Object.values(profilesMap)
          .filter(p => p.sgt_user_id !== null)
          .map(p => p.sgt_user_id);
        
        let sgtMembersMap: Record<number, { user_name: string; user_game_id: string | null }> = {};
        if (sgtUserIds.length > 0) {
          const { data: sgtMembers } = await supabase
            .from("sgt_members")
            .select("user_id, user_name, user_game_id")
            .in("user_id", sgtUserIds);
          
          if (sgtMembers) {
            sgtMembers.forEach((m: any) => {
              sgtMembersMap[m.user_id] = { user_name: m.user_name, user_game_id: m.user_game_id };
            });
          }
        }

        // Transform bookings to include customer_name and SGT info
        const bookingsWithNames = filteredBookings.map((booking: any) => {
          const profile = profilesMap[booking.user_id];
          const sgtMember = profile?.sgt_user_id ? sgtMembersMap[profile.sgt_user_id] : null;
          return {
            id: booking.id,
            booking_date: booking.booking_date,
            start_time: booking.start_time,
            end_time: booking.end_time,
            duration_hours: booking.duration_hours,
            player_count: booking.player_count,
            status: booking.status,
            user_id: booking.user_id,
            customer_name: profile 
              ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() 
              : 'Unknown',
            sgt_user_id: profile?.sgt_user_id || null,
            sgt_username: sgtMember?.user_name || null,
            sgt_game_id: sgtMember?.user_game_id || null,
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
            control_mode: deviceData?.control_mode || 'auto',
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
