// Returns a Cloudflare Stream MP4 download URL for the FULL session recording.
// Access: session owner (via bookings.user_id) or admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
  const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userRes } = await authClient.auth.getUser();
  if (!userRes?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { recording_session_id } = await req.json().catch(() => ({}));
  if (!recording_session_id) {
    return new Response(JSON.stringify({ error: "recording_session_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: session, error: sessErr } = await admin
    .from("recording_sessions")
    .select("id, stream_uid, stream_status, booking_id, player_name, bay_number, started_at")
    .eq("id", recording_session_id)
    .single();
  if (sessErr || !session) {
    return new Response(JSON.stringify({ error: sessErr?.message ?? "session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
  let allowed = !!isAdmin;
  if (!allowed && session.booking_id) {
    const { data: booking } = await admin
      .from("bookings")
      .select("user_id")
      .eq("id", session.booking_id)
      .maybeSingle();
    allowed = booking?.user_id === userRes.user.id;
  }
  if (!allowed) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const streamUid = session.stream_uid as string | null;
  if (!streamUid) {
    return new Response(JSON.stringify({ error: "Full-session video is not ready yet. Please check back shortly." }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  if (session.stream_status && session.stream_status !== "ready") {
    return new Response(JSON.stringify({ error: `Full-session video status: ${session.stream_status}` }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
  const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN")!;
  let downloadUrl = `https://customer-${accountId}.cloudflarestream.com/${streamUid}/downloads/default.mp4`;
  let status: string | null = null;
  try {
    const dlRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}/downloads`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const dlJson = await dlRes.json().catch(() => ({}));
    if (dlRes.ok && dlJson.result?.default?.url) downloadUrl = dlJson.result.default.url;
    status = dlJson.result?.default?.status ?? null;
  } catch (e) {
    console.error("[session-download-url] enable download threw", e);
  }

  if (status && status !== "ready") {
    return new Response(JSON.stringify({ status, download_url: downloadUrl, message: "Cloudflare is still preparing the MP4. Try again in a minute." }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ download_url: downloadUrl, stream_uid: streamUid }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
