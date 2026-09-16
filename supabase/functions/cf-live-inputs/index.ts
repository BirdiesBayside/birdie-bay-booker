// Admin-only: creates / refreshes a permanent Cloudflare Stream live input per bay.
// Each live input gives us an RTMPS URL + stream key (for the bay PC's OBS) and a
// stable UID we use as the playback ID on the public Sim Cup Live page.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CF_API = "https://api.cloudflare.com/client/v4";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
    const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
    if (!accountId || !token) return json({ error: "Cloudflare Stream credentials are not configured" }, 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---- auth: must be a signed-in admin ----
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "").trim();
    if (!jwt) return json({ error: "Unauthorized" }, 401);
    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admins only" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "provision");

    if (action !== "provision") return json({ error: `Unknown action: ${action}` }, 400);

    const bayId = body.bay_id ? String(body.bay_id) : null;

    const { data: bays, error: bayErr } = await admin
      .from("bays")
      .select("id, bay_number, name")
      .order("bay_number");
    if (bayErr) return json({ error: bayErr.message }, 500);

    const targets = (bays ?? []).filter((b) => !bayId || b.id === bayId);
    if (!targets.length) return json({ error: "No matching bays" }, 400);

    const results: Array<Record<string, unknown>> = [];

    for (const bay of targets) {
      const { data: device } = await admin
        .from("bay_devices")
        .select("id, cf_live_input_uid")
        .eq("bay_id", bay.id)
        .maybeSingle();

      // Reuse the existing live input if it still exists on Cloudflare.
      let input: any = null;
      if (device?.cf_live_input_uid) {
        const res = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs/${device.cf_live_input_uid}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) input = (await res.json()).result ?? null;
      }

      if (!input) {
        const res = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            meta: { name: `Birdies ${bay.name ?? `Bay ${bay.bay_number}`}` },
            recording: { mode: "automatic", timeoutSeconds: 10, requireSignedURLs: false },
          }),
        });
        const cfJson = await res.json().catch(() => ({}));
        if (!res.ok || !cfJson.result) {
          results.push({
            bay_number: bay.bay_number,
            error: cfJson?.errors?.[0]?.message ?? `Cloudflare error ${res.status}`,
          });
          continue;
        }
        input = cfJson.result;
      }

      const payload = {
        bay_id: bay.id,
        cf_live_input_uid: input.uid,
        cf_playback_id: input.uid,
        cf_rtmps_url: input.rtmps?.url ?? "rtmps://live.cloudflare.com:443/live/",
        cf_stream_key: input.rtmps?.streamKey ?? null,
      };

      if (device?.id) {
        await admin.from("bay_devices").update(payload).eq("id", device.id);
      } else {
        await admin.from("bay_devices").insert(payload);
      }

      results.push({
        bay_number: bay.bay_number,
        bay_name: bay.name,
        cf_live_input_uid: input.uid,
        cf_rtmps_url: payload.cf_rtmps_url,
      });
    }

    return json({ success: true, results });
  } catch (e) {
    console.error("cf-live-inputs failed:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
