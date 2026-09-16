// Public: powers the Sim Cup Live watch page.
// Returns each streaming-enabled bay, whether it is live right now, its player
// (from the current booking) and the Cloudflare playback details, plus recent
// replays. No auth required — it only exposes playback IDs, never stream keys.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CF_API = "https://api.cloudflare.com/client/v4";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

interface CfVideo {
  uid: string;
  status?: { state?: string };
  preview?: string;
  thumbnail?: string;
  created?: string;
  duration?: number;
}

async function listLiveInputVideos(accountId: string, token: string, inputUid: string): Promise<CfVideo[]> {
  try {
    const res = await fetch(`${CF_API}/accounts/${accountId}/stream/live_inputs/${inputUid}/videos`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const j = await res.json().catch(() => ({}));
    return Array.isArray(j.result) ? j.result : [];
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
    const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: settings } = await admin
      .from("system_settings")
      .select("sim_cup_live_enabled")
      .eq("id", "global")
      .maybeSingle();
    const eventLive = Boolean(settings?.sim_cup_live_enabled);

    const { data: devices } = await admin
      .from("bay_devices")
      .select("bay_id, cf_playback_id, stream_enabled, is_online, bays!inner(bay_number, name)")
      .not("cf_playback_id", "is", null)
      .eq("stream_enabled", true);

    const nowIso = new Date().toISOString();
    const { data: bookings } = await admin
      .from("bookings")
      .select("bay_id, start_time, end_time, status, profiles(first_name, last_name)")
      .lte("start_time", nowIso)
      .gte("end_time", nowIso)
      .eq("status", "confirmed");

    const playerByBay = new Map<string, string>();
    for (const b of bookings ?? []) {
      const p: any = (b as any).profiles;
      const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      if (name) playerByBay.set((b as any).bay_id, name);
    }

    const bays = [] as Array<Record<string, unknown>>;
    const replays = [] as Array<Record<string, unknown>>;

    for (const d of devices ?? []) {
      const bay: any = (d as any).bays;
      let live: CfVideo | null = null;
      if (accountId && token) {
        const videos = await listLiveInputVideos(accountId, token, String(d.cf_playback_id));
        live = videos.find((v) => v.status?.state === "live-inprogress") ?? null;
        for (const v of videos) {
          if (v.status?.state === "ready") {
            replays.push({
              uid: v.uid,
              bay_number: bay?.bay_number,
              bay_name: bay?.name,
              thumbnail: v.thumbnail,
              preview: v.preview,
              created: v.created,
              duration: v.duration,
            });
          }
        }
      }

      bays.push({
        bay_number: bay?.bay_number,
        bay_name: bay?.name,
        playback_id: d.cf_playback_id,
        is_online: d.is_online,
        is_live: Boolean(live),
        live_uid: live?.uid ?? null,
        thumbnail: live?.thumbnail ?? null,
        player_name: playerByBay.get(String(d.bay_id)) ?? null,
      });
    }

    bays.sort((a, b) => Number(a.bay_number ?? 0) - Number(b.bay_number ?? 0));
    replays.sort((a, b) => String(b.created ?? "").localeCompare(String(a.created ?? "")));

    return json({ event_live: eventLive, bays, replays: replays.slice(0, 24) });
  } catch (e) {
    console.error("sim-cup-live failed:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
