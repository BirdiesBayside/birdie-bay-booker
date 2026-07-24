// Fully deletes a recording session: Cloudflare Stream video (session + all
// clips), storage MKV files, and DB rows. Also supports auditing/removing
// orphaned Cloudflare Stream videos whose recording_sessions row no longer
// exists (e.g. rows dismissed before this function was wired up).
//
// POST body:
//   { session_id: "uuid" }                — delete a single session everywhere
//   { audit: true, execute?: boolean }    — list (and optionally delete) CF
//                                           Stream videos with no matching
//                                           recording_sessions row.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function deleteFromCloudflareStream(accountId: string, token: string, uid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.ok || res.status === 404) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `CF ${res.status}: ${text.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function listAllStreamVideos(accountId: string, token: string): Promise<{ uid: string; created: string; meta?: Record<string, unknown> }[]> {
  const all: { uid: string; created: string; meta?: Record<string, unknown> }[] = [];
  let before: string | null = null;
  for (let i = 0; i < 50; i++) {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`);
    url.searchParams.set("limit", "1000");
    if (before) url.searchParams.set("before", before);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`CF list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    const items = (j.result ?? []) as { uid: string; created: string; meta?: Record<string, unknown> }[];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < 1000) break;
    before = items[items.length - 1].created;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  if (!accountId || !token) return json({ error: "Cloudflare credentials missing" }, 500);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: { session_id?: string; audit?: boolean; execute?: boolean } = {};
  try { body = await req.json(); } catch { /* empty */ }

  // -------- AUDIT MODE --------
  if (body.audit) {
    const videos = await listAllStreamVideos(accountId, token);
    const uids = videos.map((v) => v.uid);

    // Gather all known UIDs still referenced in DB.
    const known = new Set<string>();
    const { data: sess } = await supabase.from("recording_sessions").select("stream_uid").not("stream_uid", "is", null);
    (sess ?? []).forEach((r: { stream_uid: string | null }) => r.stream_uid && known.add(r.stream_uid));
    const { data: clips } = await supabase.from("recording_clips").select("stream_clip_uid").not("stream_clip_uid", "is", null);
    (clips ?? []).forEach((r: { stream_clip_uid: string | null }) => r.stream_clip_uid && known.add(r.stream_clip_uid));

    const orphans = uids.filter((u) => !known.has(u));
    const results: { uid: string; deleted: boolean; error?: string }[] = [];
    if (body.execute) {
      for (const uid of orphans) {
        const r = await deleteFromCloudflareStream(accountId, token, uid);
        results.push({ uid, deleted: r.ok, error: r.error });
      }
    }
    return json({
      ok: true,
      total_cf_videos: uids.length,
      known_in_db: known.size,
      orphan_count: orphans.length,
      orphans: orphans.slice(0, 500),
      executed: !!body.execute,
      results,
    });
  }

  // -------- SINGLE SESSION DELETE --------
  const sessionId = body.session_id;
  if (!sessionId) return json({ error: "session_id required" }, 400);

  const { data: sessRow, error: sessErr } = await supabase
    .from("recording_sessions")
    .select("id, stream_uid")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr) return json({ error: sessErr.message }, 500);
  if (!sessRow) return json({ error: "session not found" }, 404);

  const streamErrors: string[] = [];
  let cfDeleted = 0;

  // Delete clip stream videos
  const { data: clipRows } = await supabase
    .from("recording_clips")
    .select("id, stream_clip_uid")
    .eq("recording_session_id", sessionId);
  for (const c of clipRows ?? []) {
    if (!c.stream_clip_uid) continue;
    const r = await deleteFromCloudflareStream(accountId, token, c.stream_clip_uid);
    if (r.ok) cfDeleted++; else streamErrors.push(`clip ${c.id}: ${r.error}`);
  }

  // Delete parent stream video
  if (sessRow.stream_uid) {
    const r = await deleteFromCloudflareStream(accountId, token, sessRow.stream_uid);
    if (r.ok) cfDeleted++; else streamErrors.push(`session: ${r.error}`);
  }

  // Delete per-hole MKV files
  const { data: holes } = await supabase.from("recording_holes").select("storage_path").eq("recording_session_id", sessionId);
  const paths = (holes ?? []).map((h) => h.storage_path).filter(Boolean) as string[];
  let filesDeleted = 0;
  if (paths.length) {
    const { error: rmErr } = await supabase.storage.from("league-highlights").remove(paths);
    if (!rmErr) filesDeleted = paths.length;
  }

  // Cascade DB rows (highlight_events -> recording_holes -> recording_clips -> recording_sessions)
  await supabase.from("highlight_events").delete().in("recording_hole_id",
    ((holes ?? []).map((h: { id?: string }) => h.id).filter(Boolean) as string[])
  );
  await supabase.from("recording_clips").delete().eq("recording_session_id", sessionId);
  await supabase.from("recording_holes").delete().eq("recording_session_id", sessionId);
  const { error: delErr } = await supabase.from("recording_sessions").delete().eq("id", sessionId);
  if (delErr) return json({ error: delErr.message, cf_deleted: cfDeleted, stream_errors: streamErrors }, 500);

  return json({
    ok: true,
    cf_deleted: cfDeleted,
    files_deleted: filesDeleted,
    stream_errors: streamErrors,
  });
});
