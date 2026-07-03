import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// Version tracking for deployment debugging
const VERSION = "2.0.0";
const DEPLOYED_AT = new Date().toISOString();
const SETTINGS_FILES = new Set(["dpsV2x3.gss", "Settings.vgs"]);
const SETTINGS_BUCKET = "gspro-user-settings";
const CSV_BUCKET = "range-session-csv";

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

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[^\d.\-+eE]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else cur += c;
      } else {
        if (c === ",") { out.push(cur); cur = ""; }
        else if (c === '"') inQuotes = true;
        else cur += c;
      }
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
}

const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_MAP: Record<string, string> = {
  shot: "shot_number", shotnumber: "shot_number", shotno: "shot_number", no: "shot_number", "#": "shot_number",
  time: "shot_timestamp", timestamp: "shot_timestamp", datetime: "shot_timestamp",
  club: "club_type", clubtype: "club_type", clubname: "club_type",
  ballspeed: "ball_speed", ballspeedmph: "ball_speed",
  clubspeed: "club_speed", clubheadspeed: "club_speed", clubspeedmph: "club_speed",
  smash: "smash_factor", smashfactor: "smash_factor",
  launchangle: "launch_angle", launch: "launch_angle", verticallaunch: "launch_angle", vla: "launch_angle",
  launchdirection: "launch_direction", horizontallaunch: "launch_direction", azimuth: "launch_direction", hla: "launch_direction",
  spin: "spin_rate", spinrate: "spin_rate", totalspin: "spin_rate", spinrpm: "spin_rate",
  spinaxis: "spin_axis", axis: "spin_axis", rawspinaxis: "spin_axis",
  backspin: "back_spin", sidespin: "side_spin",
  carry: "carry", carrydistance: "carry", carryyards: "carry",
  total: "total", totaldistance: "total", totalyards: "total",
  sidecarry: "side_carry", carryside: "side_carry", offlinecarry: "side_carry",
  side: "side_total", sidetotal: "side_total", offline: "side_carry",
  apex: "apex_height", apexheight: "apex_height", peakheight: "apex_height",
  descent: "descent_angle", decent: "descent_angle", descentangle: "descent_angle", landingangle: "descent_angle",
  aoa: "angle_of_attack", angleofattack: "angle_of_attack", attackangle: "angle_of_attack",
  clubpath: "club_path", path: "club_path",
  faceangle: "face_angle", face: "face_angle", facetotarget: "face_angle",
  facetopath: "face_to_path", ftp: "face_to_path",
};

const parseFilenameDate = (name: string | null | undefined): { date: string; iso: string } | null => {
  if (!name) return null;
  const m = String(name).match(/(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yy, hh, mi, ss] = m;
  const year = 2000 + Number(yy);
  const utcMs = Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh) - 10, Number(mi), Number(ss));
  if (!Number.isFinite(utcMs)) return null;
  return { date: `${year}-${mm}-${dd}`, iso: new Date(utcMs).toISOString() };
};

function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

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

    const hasBookingAccess = async (userId: string, bookingId: string | null) => {
      if (!userId || !bookingId) return false;
      const { data, error } = await supabase
        .from("bookings")
        .select("id")
        .eq("id", bookingId)
        .eq("user_id", userId)
        .eq("bay_id", bay.id)
        .in("status", ["confirmed", "pending"])
        .maybeSingle();
      return !error && !!data;
    };

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
          details: { ...(log.details as Record<string, unknown> || {}), local_timestamp: log.local_timestamp || null },
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

      case "get_user_setting": {
        const userId = typeof body?.user_id === "string" ? body.user_id : "";
        const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
        const file = typeof body?.file === "string" ? body.file : "";
        if (!userId || !SETTINGS_FILES.has(file)) return jsonResponse({ error: "bad_request" }, 400);
        if (!(await hasBookingAccess(userId, bookingId))) return jsonResponse({ error: "forbidden" }, 403);

        const path = `${userId}/${file}`;
        const { data, error } = await supabase.storage.from(SETTINGS_BUCKET).download(path);
        if (error || !data) return jsonResponse({ exists: false });

        const buf = new Uint8Array(await data.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        return jsonResponse({ exists: true, base64: btoa(bin) });
      }

      case "save_user_setting": {
        const userId = typeof body?.user_id === "string" ? body.user_id : "";
        const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
        const file = typeof body?.file === "string" ? body.file : "";
        const base64 = typeof body?.base64 === "string" ? body.base64 : "";
        if (!userId || !SETTINGS_FILES.has(file) || !base64) return jsonResponse({ error: "bad_request" }, 400);
        if (!(await hasBookingAccess(userId, bookingId))) return jsonResponse({ error: "forbidden" }, 403);

        let bytes: Uint8Array;
        try { bytes = decodeBase64(base64); }
        catch { return jsonResponse({ error: "invalid_base64" }, 400); }

        const path = `${userId}/${file}`;
        const { error } = await supabase.storage.from(SETTINGS_BUCKET).upload(path, bytes, { upsert: true, contentType: "application/octet-stream" });
        if (error) return jsonResponse({ error: "upload_failed", detail: error.message }, 500);
        return jsonResponse({ ok: true, path });
      }

      case "ingest_range_session": {
        const userId = typeof body?.user_id === "string" ? body.user_id : "";
        const bookingId = typeof body?.booking_id === "string" ? body.booking_id : null;
        const explicitBayId = typeof body?.bay_id === "string" ? body.bay_id : null;
        const csvBase64 = typeof body?.csv_base64 === "string" ? body.csv_base64 : "";
        const csvTextBody = typeof body?.csv_text === "string" ? body.csv_text : "";
        const filename = typeof body?.filename === "string" ? body.filename : null;
        if (!userId || (!csvBase64 && !csvTextBody)) return jsonResponse({ error: "missing_fields" }, 400);
        if (!(await hasBookingAccess(userId, bookingId))) return jsonResponse({ error: "forbidden" }, 403);

        let csvText: string;
        try {
          csvText = csvTextBody || new TextDecoder().decode(decodeBase64(csvBase64));
        } catch (e) {
          return jsonResponse({ error: "invalid_csv_base64", detail: String(e) }, 400);
        }

        const { headers, rows } = parseCsv(csvText);
        if (headers.length === 0 || rows.length === 0) return jsonResponse({ error: "empty_csv" }, 400);

        const colMap: (string | null)[] = headers.map((h) => FIELD_MAP[canonical(h)] ?? null);
        const filenameStamp = parseFilenameDate(filename);

        const { data: session, error: sessErr } = await supabase
          .from("range_sessions")
          .insert({
            user_id: userId,
            booking_id: bookingId,
            bay_id: explicitBayId ?? bay.id,
            shot_count: rows.length,
            source_filename: filename,
            ...(filenameStamp ? { session_date: filenameStamp.date, started_at: filenameStamp.iso } : {}),
          })
          .select("id")
          .single();
        if (sessErr || !session) return jsonResponse({ error: "session_insert_failed", detail: sessErr?.message }, 500);

        const sessionId = session.id;
        const NUMERIC_COLS = new Set([
          "ball_speed", "club_speed", "smash_factor", "launch_angle", "launch_direction",
          "spin_rate", "spin_axis", "back_spin", "side_spin", "carry", "total", "side_carry",
          "side_total", "apex_height", "descent_angle", "angle_of_attack", "club_path",
          "face_angle", "face_to_path",
        ]);

        const shotRows = rows.map((row, idx) => {
          const rec: Record<string, unknown> = { session_id: sessionId, shot_number: idx + 1 };
          const raw: Record<string, string> = {};
          row.forEach((val, i) => {
            const key = colMap[i];
            const hdr = headers[i];
            raw[hdr] = val;
            if (!key) return;
            if (key === "shot_number") { const n = num(val); if (n !== null) rec.shot_number = n; }
            else if (key === "shot_timestamp") { const t = Date.parse(val); if (!Number.isNaN(t)) rec.shot_timestamp = new Date(t).toISOString(); }
            else if (key === "club_type") { if (val) rec.club_type = val; }
            else if (NUMERIC_COLS.has(key)) { const n = num(val); if (n !== null) rec[key] = n; }
          });
          rec.raw = raw;
          return rec;
        });

        const CHUNK = 500;
        for (let i = 0; i < shotRows.length; i += CHUNK) {
          const { error } = await supabase.from("range_shots").insert(shotRows.slice(i, i + CHUNK));
          if (error) return jsonResponse({ error: "shot_insert_failed", detail: error.message, session_id: sessionId }, 500);
        }

        const stamps = shotRows.map((r) => r.shot_timestamp as string | undefined).filter(Boolean).sort();
        const started = stamps[0] ?? null;
        const ended = stamps[stamps.length - 1] ?? null;
        const durationMin = started && ended ? (new Date(ended).getTime() - new Date(started).getTime()) / 60000 : null;

        const csvPath = `${userId}/${sessionId}.csv`;
        const { error: upErr } = await supabase.storage.from(CSV_BUCKET).upload(csvPath, new Blob([csvText], { type: "text/csv" }), { upsert: true });
        const finalCsvPath = upErr ? null : csvPath;

        const updatePayload: Record<string, unknown> = { csv_path: finalCsvPath };
        if (started) updatePayload.started_at = started;
        if (ended) updatePayload.ended_at = ended;
        if (durationMin != null) updatePayload.duration_minutes = durationMin;
        await supabase.from("range_sessions").update(updatePayload).eq("id", sessionId);

        await supabase.from("bay_controller_logs").insert({
          bay_number: bayNumber,
          event_type: "automation_decision",
          event_level: "info",
          message: `[CSV] Ingested ${filename ?? "CSV"} for Swing Lab: shots=${shotRows.length}`,
          details: { session_id: sessionId, filename, shot_count: shotRows.length, local_timestamp: new Date().toISOString() },
          booking_id: bookingId,
          app_version: appVersion,
        });

        return jsonResponse({ ok: true, session_id: sessionId, shot_count: shotRows.length, started_at: started, ended_at: ended, csv_path: finalCsvPath });
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
