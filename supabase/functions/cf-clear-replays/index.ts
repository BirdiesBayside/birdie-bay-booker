// One-off: list saved (ready) videos on every bay live input and delete them,
// so the Sim Cup Live page starts Saturday with an empty replays section.
// GET with ?dryRun=true to only list.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CF_API = "https://api.cloudflare.com/client/v4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  if (!accountId || !token) return json({ error: "Cloudflare credentials missing" }, 500);

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";
  const deleteAll = new URL(req.url).searchParams.get("all") === "true";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: devices } = await admin
    .from("bay_devices")
    .select("cf_live_input_uid")
    .not("cf_live_input_uid", "is", null);

  const results: Record<string, { ready: string[]; other: { uid: string; state: string }[]; deleted: string[]; errors: string[] }> = {};

  for (const d of devices ?? []) {
    const inputUid = (d as { cf_live_input_uid: string }).cf_live_input_uid;
    const entry = { ready: [] as string[], other: [] as { uid: string; state: string }[], deleted: [] as string[], errors: [] as string[] };
    results[inputUid] = entry;

    const listRes = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs/${inputUid}/videos`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!listRes.ok) {
      entry.errors.push(`list ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
      continue;
    }
    const j = await listRes.json().catch(() => ({}));
    const videos = (Array.isArray(j.result) ? j.result : []) as { uid: string; status?: { state?: string } }[];

    for (const v of videos) {
      const state = v.status?.state ?? "unknown";
      if (state === "ready" || deleteAll) {
        entry.ready.push(v.uid);
        if (dryRun) continue;
        const delRes = await fetch(`${CF_API}/accounts/${accountId}/stream/${v.uid}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (delRes.ok || delRes.status === 404) entry.deleted.push(v.uid);
        else entry.errors.push(`delete ${v.uid} ${delRes.status}: ${(await delRes.text()).slice(0, 200)}`);
      } else {
        entry.other.push({ uid: v.uid, state });
      }
    }
  }

  return json({ ok: true, dry_run: dryRun, results });
});
