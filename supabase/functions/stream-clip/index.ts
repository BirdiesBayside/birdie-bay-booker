// Queues a Cloudflare Stream clip. Returns immediately after inserting a
// recording_clips row with status='queued'; Cloudflare work runs in the
// background so the UI can keep clipping without waiting.
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

async function processClip(clipId: string, params: {
  admin: any;
  accountId: string;
  token: string;
  streamUid: string;
  startSec: number;
  endSec: number;
}) {
  const { admin, accountId, token, streamUid, startSec, endSec } = params;
  try {
    // Ensure source is ready before clipping.
    const source = await getStreamVideo(accountId, token, streamUid);
    if (!source || source.status?.state !== "ready") {
      await admin.from("recording_clips").update({
        status: "failed",
        error: `source video not ready (${source?.status?.state ?? "unknown"})`,
      }).eq("id", clipId);
      return;
    }

    await admin.from("recording_clips").update({ status: "processing" }).eq("id", clipId);

    const clipRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/clip`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        clippedFromVideoUID: streamUid,
        startTimeSeconds: Math.floor(startSec),
        endTimeSeconds: Math.ceil(endSec),
      }),
    });
    const clipJson = await clipRes.json().catch(() => ({}));
    if (!clipRes.ok) {
      const errMsg = clipJson.errors?.[0]?.message ?? clipJson.errors?.[0]?.code ?? `Cloudflare clip failed (${clipRes.status})`;
      await admin.from("recording_clips").update({ status: "failed", error: errMsg }).eq("id", clipId);
      return;
    }
    const clipUid = clipJson.result?.uid;
    if (!clipUid) {
      await admin.from("recording_clips").update({ status: "failed", error: "no clip uid returned" }).eq("id", clipId);
      return;
    }
    await admin.from("recording_clips").update({ stream_clip_uid: clipUid }).eq("id", clipId);

    // Poll until ready (up to ~5 min).
    let clip: any = null;
    for (let i = 0; i < 90; i++) {
      clip = await getStreamVideo(accountId, token, clipUid);
      if (clip?.status?.state === "ready") break;
      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!clip || clip.status?.state !== "ready") {
      await admin.from("recording_clips").update({ status: "failed", error: "clip still processing after timeout", stream_clip_uid: clipUid }).eq("id", clipId);
      return;
    }

    const playbackUrl = clip.playback?.hls ?? `https://customer-${accountId}.cloudflarestream.com/${clipUid}/manifest/video.m3u8`;
    let downloadUrl = `https://customer-${accountId}.cloudflarestream.com/${clipUid}/downloads/default.mp4`;
    try {
      const dlRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${clipUid}/downloads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const dlJson = await dlRes.json().catch(() => ({}));
      if (dlRes.ok && dlJson.result?.default?.url) downloadUrl = dlJson.result.default.url;
    } catch (e) {
      console.error("[stream-clip] enable download threw", e);
    }

    await admin.from("recording_clips").update({
      status: "ready",
      stream_clip_uid: clipUid,
      download_url: downloadUrl,
      playback_url: playbackUrl,
      error: null,
    }).eq("id", clipId);
  } catch (e: any) {
    console.error("[stream-clip] background error", e);
    await admin.from("recording_clips").update({ status: "failed", error: e?.message ?? String(e) }).eq("id", clipId);
  }
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

  const { recording_session_id, start_seconds, end_seconds, label } = await req.json();
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

  // Insert queued row up front so the UI can move on immediately.
  const { data: clipRow, error: insErr } = await admin.from("recording_clips").insert({
    recording_session_id: session.id,
    start_seconds,
    end_seconds,
    status: "queued",
    label: label ?? null,
    created_by: userRes.user.id,
  }).select("id").single();

  if (insErr || !clipRow) {
    return new Response(JSON.stringify({ error: insErr?.message ?? "failed to queue clip" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Fire-and-forget the Cloudflare work.
  // @ts-ignore EdgeRuntime is provided by Supabase edge runtime.
  EdgeRuntime.waitUntil(processClip(clipRow.id, { admin, accountId, token, streamUid, startSec: start_seconds, endSec: end_seconds }));

  return new Response(JSON.stringify({
    clip_id: clipRow.id,
    status: "queued",
    start_seconds,
    end_seconds,
  }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
