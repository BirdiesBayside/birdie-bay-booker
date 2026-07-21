// Creates a clip from a Cloudflare Stream video and returns a download URL.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getStreamVideo(accountId: string, token: string, uid: string) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.result ?? null;
}

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
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { recording_session_id, start_seconds, end_seconds } = await req.json();
  if (!recording_session_id || typeof start_seconds !== "number" || typeof end_seconds !== "number" || start_seconds >= end_seconds) {
    return new Response(JSON.stringify({ error: "recording_session_id, start_seconds and end_seconds required; start must be less than end" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: session, error: sessErr } = await admin
    .from("recording_sessions")
    .select("id, stream_uid, player_name, bay_number, started_at")
    .eq("id", recording_session_id)
    .single();

  if (sessErr || !session) {
    return new Response(JSON.stringify({ error: sessErr?.message ?? "session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const streamUid = session.stream_uid as string | null;
  if (!streamUid) {
    return new Response(JSON.stringify({ error: "session has not been uploaded to Stream yet" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
  const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN")!;

  // Ensure source video is ready before clipping.
  const source = await getStreamVideo(accountId, token, streamUid);
  if (!source || source.status?.state !== "ready") {
    return new Response(JSON.stringify({ error: "source video is not ready yet", status: source?.status?.state ?? "unknown" }), { status: 425, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const clipRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}/clip`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ start: start_seconds, end: end_seconds }),
  });

  const clipJson = await clipRes.json().catch(() => ({}));
  if (!clipRes.ok) {
    return new Response(JSON.stringify({ error: clipJson.errors?.[0]?.message ?? "Cloudflare clip failed" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const clipUid = clipJson.result?.uid;
  if (!clipUid) {
    return new Response(JSON.stringify({ error: "Cloudflare did not return a clip uid" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Poll briefly until the clip is ready.
  let clip: any = null;
  for (let i = 0; i < 30; i++) {
    clip = await getStreamVideo(accountId, token, clipUid);
    if (clip?.status?.state === "ready") break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!clip || clip.status?.state !== "ready") {
    return new Response(JSON.stringify({ error: "clip is still processing", clip_uid: clipUid }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const playbackUrl = clip.playback?.hls ?? `https://customer-${accountId}.cloudflarestream.com/${clipUid}/manifest/video.m3u8`;
  const downloadUrl = clip.playback?.mp4 ?? `https://customer-${accountId}.cloudflarestream.com/${clipUid}/downloads/default.mp4`;

  // Persist the clip record.
  await admin.from("recording_clips").insert({
    recording_session_id: session.id,
    start_seconds,
    end_seconds,
    stream_clip_uid: clipUid,
    download_url: downloadUrl,
    created_by: userRes.user.id,
  });

  return new Response(JSON.stringify({
    clip_uid: clipUid,
    playback_url: playbackUrl,
    download_url: downloadUrl,
    start_seconds,
    end_seconds,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
