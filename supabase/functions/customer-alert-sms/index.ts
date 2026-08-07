// Customer Alerts: SMS broadcast to every booking whose start falls inside an
// admin-defined window. Runs on demand (when an alert is activated) and on a
// schedule so bookings created later in the window are also messaged.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[CUSTOMER-ALERT] ${s}${d ? " " + JSON.stringify(d) : ""}`);

// Australia/Brisbane is a fixed UTC+10 offset (no DST).
const BRIS_OFFSET_MS = 10 * 60 * 60 * 1000;
const toBrisbaneParts = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + BRIS_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    // "YYYY-MM-DDTHH:MM" comparable string
    key: d.toISOString().slice(0, 16),
  };
};

const formatPhoneForSMS = (phone: string | null): string | null => {
  if (!phone) return null;
  let c = phone.replace(/\D/g, "");
  if (c.startsWith("0")) c = "61" + c.slice(1);
  else if (!c.startsWith("61") && c.length === 9) c = "61" + c;
  if (c.length !== 11 || !c.startsWith("614")) return null;
  return c;
};

const sendSMS = async (phone: string, message: string) => {
  const username = Deno.env.get("SMS_BROADCAST_USERNAME");
  const password = Deno.env.get("SMS_BROADCAST_PASSWORD");
  if (!username || !password) return { success: false, error: "SMS credentials not configured" };
  const formatted = formatPhoneForSMS(phone);
  if (!formatted) return { success: false, error: "invalid phone number" };
  const params = new URLSearchParams({
    username, password, to: formatted, from: "Birdies", message,
  });
  try {
    const r = await fetch(`https://api.smsbroadcast.com.au/api-adv.php?${params.toString()}`);
    const txt = await r.text();
    return txt.startsWith("OK:")
      ? { success: true, response: txt, phone: formatted }
      : { success: false, error: txt, phone: formatted };
  } catch (e) {
    return { success: false, error: (e as Error).message, phone: formatted };
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const cronSecret = body?.cron_secret as string | undefined;
    const isCron = !!cronSecret && cronSecret === Deno.env.get("CUSTOMER_ALERT_CRON_SECRET");

    // Anything that is not the scheduled job must be an authenticated admin.
    if (!isCron) {
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const { data: userData } = await admin.auth.getUser(token);
      const uid = userData?.user?.id;
      if (!uid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: isAdmin } = await admin.rpc("has_role", { _user_id: uid, _role: "admin" });
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Admin access required" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const alertId = body?.alert_id as string | undefined;

    let query = admin.from("customer_alerts").select("*").eq("is_active", true);
    if (alertId) query = admin.from("customer_alerts").select("*").eq("id", alertId);
    const { data: alerts, error: alertsError } = await query;
    if (alertsError) throw alertsError;

    const results: unknown[] = [];
    const nowIso = new Date().toISOString();

    for (const alert of alerts ?? []) {
      const start = toBrisbaneParts(alert.window_start);
      const end = toBrisbaneParts(alert.window_end);

      const { data: bookings, error: bookingsError } = await admin
        .from("bookings")
        .select("id, user_id, booking_date, start_time, status")
        .gte("booking_date", start.date)
        .lte("booking_date", end.date)
        .in("status", ["confirmed", "pending"]);
      if (bookingsError) throw bookingsError;

      const inWindow = (bookings ?? []).filter((b) => {
        const key = `${b.booking_date}T${String(b.start_time).slice(0, 5)}`;
        return key >= start.key && key <= end.key;
      });

      const { data: sentRows } = await admin
        .from("customer_alert_sends")
        .select("booking_id")
        .eq("alert_id", alert.id);
      const sentSet = new Set((sentRows ?? []).map((r) => r.booking_id));
      const todo = inWindow.filter((b) => !sentSet.has(b.id));

      const userIds = [...new Set(todo.map((b) => b.user_id))];
      const profileMap = new Map<string, { phone: string | null }>();
      if (userIds.length) {
        const { data: profiles } = await admin
          .from("profiles")
          .select("user_id, phone")
          .in("user_id", userIds);
        for (const p of profiles ?? []) profileMap.set(p.user_id, p);
      }

      let sent = 0, failed = 0;
      for (const b of todo) {
        const phone = profileMap.get(b.user_id)?.phone ?? null;
        if (!phone) {
          await admin.from("customer_alert_sends").insert({
            alert_id: alert.id, booking_id: b.id,
            success: false, response: "no phone on profile",
          });
          failed++;
          continue;
        }
        const result = await sendSMS(phone, alert.message);
        await admin.from("customer_alert_sends").insert({
          alert_id: alert.id,
          booking_id: b.id,
          phone: result.phone ?? phone,
          success: result.success,
          response: result.success ? result.response : result.error,
        });
        if (result.success) sent++; else failed++;
      }

      // Deactivate once the window has fully passed (admin deletes manually).
      const expired = new Date(alert.window_end).getTime() < Date.now();
      await admin
        .from("customer_alerts")
        .update({ last_run_at: nowIso, ...(expired ? { is_active: false } : {}) })
        .eq("id", alert.id);

      log("Alert processed", { id: alert.id, eligible: inWindow.length, sent, failed, expired });
      results.push({ alert_id: alert.id, eligible: inWindow.length, sent, failed, deactivated: expired });
    }

    return new Response(JSON.stringify({ processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log("Error", { message: (e as Error).message });
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
