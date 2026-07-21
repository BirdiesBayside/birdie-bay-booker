// Uploads a league-highlights MKV from Supabase Storage to Cloudflare Stream.
// Uses Cloudflare's copy-from-URL endpoint so the file is pulled directly,
// avoiding Edge Function memory/timeout limits for large MKVs.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SessionRow {
  id: string;
  mkv_path: string | null;
  player_name: string | null;
  tournament_name: string | null;
  bay_number: number;
  started_at: string | null;
  stream_uid: string | null;
  stream_status: string | null;
}

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

  const { recording_session_id } = await req.json();
  if (!recording_session_id) {
    return new Response(JSON.stringify({ error: "recording_session_id required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const { data: session, error: sessErr } = await admin
    .from("recording_sessions")
    .select("id, mkv_path, player_name, tournament_name, bay_number, started_at, stream_uid, stream_status")
    .eq("id", recording_session_id)
    .single();

  if (sessErr || !session) {
    return new Response(JSON.stringify({ error: sessErr?.message ?? "session not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const sess = session as SessionRow;

  if (!sess.mkv_path) {
    return new Response(JSON.stringify({ error: "session has no mkv_path" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
  const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN")!;
  const playbackUrl = (uid: string) => `https://customer-${accountId}.cloudflarestream.com/${uid}/manifest/video.m3u8`;

  // If we already have a UID, check current status first.
  if (sess.stream_uid) {
    const existing = await getStreamVideo(accountId, token, sess.stream_uid);
    if (existing) {
      const state = existing.status?.state;
      await admin.from("recording_sessions").update({
        stream_status: state === "ready" ? "ready" : state ?? "inprogress",
        stream_error: existing.status?.errorReasonText ?? null,
        stream_created_at: existing.created ?? null,
      }).eq("id", sess.id);
      if (state === "ready") {
        return new Response(JSON.stringify({ stream_uid: sess.stream_uid, status: "ready", playback_url: playbackUrl(sess.stream_uid) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ stream_uid: sess.stream_uid, status: state ?? "inprogress", playback_url: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Mint a signed URL for Cloudflare to pull the MKV.
  const { data: signed, error: signedErr } = await admin.storage.from("league-highlights").createSignedUrl(sess.mkv_path, 7200);
  if (signedErr || !signed?.signedUrl) {
    return new Response(JSON.stringify({ error: signedErr?.message ?? "failed to create signed url" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Start a fresh copy upload.
  const title = `${sess.player_name ?? "Unknown"} — Bay ${sess.bay_number}${sess.tournament_name ? ` — ${sess.tournament_name}` : ""}`;
  console.log("[stream-upload] Requesting CF copy", { accountId: accountId?.slice(0, 6) + "…", hasToken: !!token, title, signedUrlHost: new URL(signed.signedUrl).host });

  const copyRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: signed.signedUrl,
      meta: { name: title },
      requireSignedURLs: false,
      allowedOrigins: ["birdiesbayside.com.au", "*.birdiesbayside.com.au", "*.lovable.app"],
    }),
  });

  const copyText = await copyRes.text();
  let copyJson: any = {};
  try { copyJson = JSON.parse(copyText); } catch {}
  if (!copyRes.ok) {
    console.error("[stream-upload] CF copy failed", copyRes.status, copyText);
    const cfError = copyJson.errors?.[0];
    const msg = cfError
      ? `Cloudflare Stream error ${cfError.code}: ${cfError.message}${copyRes.status === 401 ? " — check the Account ID/API token and Stream edit permission." : ""}`
      : `Cloudflare copy failed (${copyRes.status})`;
    await admin.from("recording_sessions").update({
      stream_status: "failed",
      stream_error: msg,
    }).eq("id", sess.id);
    return new Response(JSON.stringify({ error: msg, cf_status: copyRes.status, cf_body: copyText.slice(0, 500) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const uid = copyJson.result?.uid;
  if (!uid) {
    return new Response(JSON.stringify({ error: "Cloudflare did not return a stream uid" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  await admin.from("recording_sessions").update({
    stream_uid: uid,
    stream_status: "inprogress",
    stream_created_at: new Date().toISOString(),
  }).eq("id", sess.id);

  return new Response(JSON.stringify({ stream_uid: uid, status: "inprogress", playback_url: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
