// Deletes recordings whose retention_until has passed. Called on a daily cron.
// Removes: (1) per-hole MKV files in the league-highlights bucket,
// (2) the Cloudflare Stream video (if any), and (3) marks the row as purged.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function deleteFromCloudflareStream(uid: string): Promise<{ ok: boolean; error?: string }> {
  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  if (!accountId || !token) return { ok: false, error: "cloudflare credentials missing" };
  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    // 404 means already gone — treat as success.
    if (res.ok || res.status === 404) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `CF ${res.status}: ${text.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const nowIso = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from("recording_sessions")
    .select("id, stream_uid")
    .lt("retention_until", nowIso)
    .neq("status", "purged");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let filesDeleted = 0;
  let streamsDeleted = 0;
  const streamErrors: string[] = [];

  for (const sess of expired ?? []) {
    // 1. Delete per-hole MKV files from Storage.
    const { data: holes } = await supabase.from("recording_holes").select("storage_path").eq("recording_session_id", sess.id);
    const paths = (holes ?? []).map((h) => h.storage_path).filter(Boolean) as string[];
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from("league-highlights").remove(paths);
      if (!rmErr) filesDeleted += paths.length;
    }

    // 2. Delete Cloudflare Stream video, if we uploaded one.
    if (sess.stream_uid) {
      const res = await deleteFromCloudflareStream(sess.stream_uid);
      if (res.ok) {
        streamsDeleted += 1;
      } else if (res.error) {
        streamErrors.push(`${sess.id}: ${res.error}`);
      }
    }

    // 3. Mark session as purged and clear stream metadata so it can't be re-opened.
    await supabase.from("recording_sessions").update({
      status: "purged",
      stream_uid: null,
      stream_status: "purged",
      updated_at: nowIso,
    }).eq("id", sess.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    sessions_purged: expired?.length ?? 0,
    files_deleted: filesDeleted,
    streams_deleted: streamsDeleted,
    stream_errors: streamErrors,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
