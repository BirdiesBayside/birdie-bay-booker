// Streams a Cloudflare Stream MP4 back to the browser with CORS headers.
//
// Safari/iOS cannot fetch() the raw cloudflarestream.com download URL from our
// origin (no CORS on that endpoint) which surfaced as "Load failed" when the
// Save-to-Photos flow tried to pull the file into memory. Proxying through this
// function keeps everything on Cloudflare (no Storage copies) while making the
// bytes readable by the page so we can hand a real File to the share sheet.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-length, content-type, content-disposition",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userRes } = await authClient.auth.getUser();
    if (!userRes?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { clip_id, recording_session_id, filename } = await req.json().catch(() => ({} as any));

    let sessionId: string | null = recording_session_id ?? null;
    let sourceUrl: string | null = null;

    if (clip_id) {
      const { data: clip } = await admin
        .from("recording_clips")
        .select("id, recording_session_id, status, download_url")
        .eq("id", clip_id)
        .maybeSingle();
      if (!clip) return json({ error: "clip not found" }, 404);
      if (clip.status !== "ready" || !clip.download_url) return json({ error: "clip is not ready yet" }, 409);
      sessionId = clip.recording_session_id;
      sourceUrl = clip.download_url;
    }
    if (!sessionId) return json({ error: "clip_id or recording_session_id required" }, 400);

    const { data: session } = await admin
      .from("recording_sessions")
      .select("id, booking_id, stream_uid, stream_status")
      .eq("id", sessionId)
      .maybeSingle();
    if (!session) return json({ error: "session not found" }, 404);

    // Access: admin, or the customer whose booking produced the recording.
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
    let allowed = !!isAdmin;
    if (!allowed && session.booking_id) {
      const { data: booking } = await admin.from("bookings").select("user_id").eq("id", session.booking_id).maybeSingle();
      allowed = booking?.user_id === userRes.user.id;
    }
    if (!allowed) return json({ error: "forbidden" }, 403);

    // Full-session download (no clip_id): resolve the Cloudflare MP4 for the session.
    if (!sourceUrl) {
      if (!session.stream_uid) return json({ error: "Full-session video is not ready yet." }, 409);
      if (session.stream_status && session.stream_status !== "ready") {
        return json({ error: `Full-session video status: ${session.stream_status}` }, 409);
      }
      const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")!;
      const token = Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN")!;
      // Ensure a downloadable MP4 has been generated.
      await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${session.stream_uid}/downloads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: "{}",
      }).catch(() => undefined);
      sourceUrl = `https://customer-${accountId}.cloudflarestream.com/${session.stream_uid}/downloads/default.mp4`;
    }

    const upstream = await fetch(sourceUrl, { headers: req.headers.get("Range") ? { Range: req.headers.get("Range")! } : {} });
    if (!upstream.ok && upstream.status !== 206) {
      return json({ error: `Cloudflare returned ${upstream.status}. The video may still be preparing.` }, 502);
    }

    const name = typeof filename === "string" && filename ? filename.replace(/[^a-z0-9._-]+/gi, "-") : "clip.mp4";
    const headers = new Headers(corsHeaders);
    headers.set("Content-Type", "video/mp4");
    headers.set("Content-Disposition", `attachment; filename="${name}"`);
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    const range = upstream.headers.get("content-range");
    if (range) headers.set("Content-Range", range);

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
