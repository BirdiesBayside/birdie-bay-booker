// Temporary diagnostic: check Cloudflare live input status per bay.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CF_API = "https://api.cloudflare.com/client/v4";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: devices } = await admin
    .from("bay_devices")
    .select("cf_live_input_uid, bays!inner(bay_number)")
    .not("cf_live_input_uid", "is", null);

  const out = [] as Array<Record<string, unknown>>;
  for (const d of devices ?? []) {
    const res = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs/${d.cf_live_input_uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json().catch(() => ({}));
    const r = j.result ?? {};
    out.push({
      bay: (d as any).bays?.bay_number,
      uid: d.cf_live_input_uid,
      http: res.status,
      status: r.status ?? null,
      meta: r.meta ?? null,
      rtmps_url: r.rtmps?.url ?? null,
      key_prefix: (r.rtmps?.streamKey ?? "").slice(0, 8),
      errors: j.errors ?? null,
    });
  }
  return new Response(JSON.stringify(out), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
