// Deletes recordings whose retention_until has passed. Called on a daily cron.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const nowIso = new Date().toISOString();
  const { data: expired, error } = await supabase
    .from("recording_sessions")
    .select("id")
    .lt("retention_until", nowIso)
    .neq("status", "purged");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let filesDeleted = 0;
  for (const sess of expired ?? []) {
    const { data: holes } = await supabase.from("recording_holes").select("storage_path").eq("recording_session_id", sess.id);
    const paths = (holes ?? []).map((h) => h.storage_path).filter(Boolean) as string[];
    if (paths.length) {
      const { error: rmErr } = await supabase.storage.from("league-highlights").remove(paths);
      if (!rmErr) filesDeleted += paths.length;
    }
    await supabase.from("recording_sessions").update({ status: "purged", updated_at: nowIso }).eq("id", sess.id);
  }

  return new Response(JSON.stringify({ ok: true, sessions_purged: expired?.length ?? 0, files_deleted: filesDeleted }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
