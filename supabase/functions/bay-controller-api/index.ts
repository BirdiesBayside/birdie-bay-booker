import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Version tracking for deployment debugging
const VERSION = "2.0.0";
const DEPLOYED_AT = new Date().toISOString();

// Full CORS headers compatible with supabase-js client
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-bay-number, x-app-version, x-action, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Helper to add version info to all responses
const jsonResponse = (data: Record<string, unknown>, status = 200) => {
  return new Response(
    JSON.stringify({
      ...data,
      _version: VERSION,
      _deployed_at: DEPLOYED_AT,
    }),
    { 
      status, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    }
  );
};

// Helper to determine action from multiple sources
const getAction = (
  url: URL, 
  headers: Headers, 
  body: Record<string, unknown> | null
): string | null => {
  // Priority: header > query param > body
  const headerAction = headers.get("x-action");
  if (headerAction) return headerAction;
  
  const queryAction = url.searchParams.get("action");
  if (queryAction) return queryAction;
  
  if (body && typeof body.action === "string") return body.action;
  
  // Auto-detect log request by payload shape
  if (body && Array.isArray(body.logs)) return "log";
  
  return null;
};

serve(async (req) => {
  // Handle CORS preflight with proper response body
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const url = new URL(req.url);
    const bayNumber = parseInt(req.headers.get("x-bay-number") || url.searchParams.get("bay") || "0");
    const appVersion = req.headers.get("x-app-version") || "unknown";

    // Parse body once for action detection and payload
    let body: Record<string, unknown> | null = null;
    if (req.method === "POST" || req.method === "PUT") {
      try {
        body = await req.json();
      } catch {
        // Body might be empty or not JSON - that's OK
        body = null;
      }
    }

    const action = getAction(url, req.headers, body);

    console.log(`[${VERSION}] Bay Controller API - Action: ${action || "bookings"}, Bay: ${bayNumber}, Version: ${appVersion}`);

    if (!bayNumber || bayNumber < 1 || bayNumber > 6) {
      return jsonResponse({ error: "Invalid bay number. Must be 1-6." }, 400);
    }

    // Get the bay ID from bay number
    const { data: bay, error: bayError } = await supabase
      .from("bays")
      .select("id, name")
      .eq("bay_number", bayNumber)
      .single();

    if (bayError || !bay) {
      console.error(`[${VERSION}] Bay lookup error:`, bayError);
      return jsonResponse({ error: "Bay not found" }, 404);
    }

    // Handle different actions
    switch (action) {
      case "heartbeat": {
        // Lightweight heartbeat - only upsert device status, no bookings fetch
        const { data: deviceData, error: upsertError } = await supabase
          .from("bay_devices")
          .upsert({
            bay_id: bay.id,
            is_online: true,
            last_seen: new Date().toISOString(),
            app_version: appVersion,
          }, { onConflict: "bay_id" })
          .select("control_mode")
          .single();

        if (upsertError) {
          console.error(`[${VERSION}] Heartbeat upsert error:`, upsertError);
          return jsonResponse({ error: "Failed to update heartbeat" }, 500);
        }

        return jsonResponse({ 
          success: true, 
          timestamp: new Date().toISOString(),
          control_mode: deviceData?.control_mode || 'auto',
        });
      }

      case "log": {
        // Handle logging from bay controller apps
        const logs = Array.isArray(body?.logs) ? body.logs : (body ? [body] : []);
        
        if (logs.length === 0) {
          return jsonResponse({ error: "No logs provided" }, 400);
        }
        
        console.log(`[${VERSION}] Received ${logs.length} log entries from bay ${bayNumber}`);
        
        const logEntries = logs.map((log: Record<string, unknown>) => ({
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
          console.error(`[${VERSION}] Log insert error:`, insertError);
          return jsonResponse({ error: "Failed to store logs", details: insertError.message }, 500);
        }
        
        return jsonResponse({ success: true, count: logEntries.length });
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
        
        console.log(`[${VERSION}] Server UTC time: ${now.toISOString()}, Timezone: ${timezone}, Local date: ${localDateStr}, Local time: ${localTimeStr}`);

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
        const filteredBookings = (bookings || []).filter((booking: Record<string, unknown>) => {
          if ((booking.booking_date as string) > localDateStr) {
            // Future date - always include
            return true;
          }
          // Today's date - only include if booking hasn't ended yet
          return (booking.end_time as string) > localTimeStr;
        });

        if (bookingsError) {
          console.error(`[${VERSION}] Bookings fetch error:`, bookingsError);
          return jsonResponse({ error: "Failed to fetch bookings" }, 500);
        }

        // Fetch customer names and SGT info for each booking
        const userIds = [...new Set(filteredBookings.map((b: Record<string, unknown>) => b.user_id as string))];
        let profilesMap: Record<string, { first_name: string; last_name: string; sgt_user_id: number | null }> = {};
        
        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name, sgt_user_id")
            .in("user_id", userIds);
          
          if (profiles) {
            profiles.forEach((p: Record<string, unknown>) => {
              profilesMap[p.user_id as string] = { 
                first_name: p.first_name as string, 
                last_name: p.last_name as string,
                sgt_user_id: p.sgt_user_id as number | null
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
            sgtMembers.forEach((m: Record<string, unknown>) => {
              sgtMembersMap[m.user_id as number] = { 
                user_name: m.user_name as string, 
                user_game_id: m.user_game_id as string | null 
              };
            });
          }
        }

        // Transform bookings to include customer_name and SGT info
        const bookingsWithNames = filteredBookings.map((booking: Record<string, unknown>) => {
          const profile = profilesMap[booking.user_id as string];
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

        console.log(`[${VERSION}] Returning ${filteredBookings.length} bookings for bay ${bayNumber} (filtered from ${bookings?.length || 0})`);

        return jsonResponse({
          bay: {
            id: bay.id,
            number: bayNumber,
            name: bay.name,
          },
          bookings: bookingsWithNames,
          control_mode: deviceData?.control_mode || 'auto',
          server_time: new Date().toISOString(),
        });
      }
    }
  } catch (error: unknown) {
    console.error(`[${VERSION}] Bay Controller API error:`, error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
