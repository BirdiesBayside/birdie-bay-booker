import { createClient } from "npm:@supabase/supabase-js@2.57.2";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

const pixelResponse = () =>
  new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
      "Pragma": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });

function decodeEmail(raw: string): string | null {
  try {
    const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const email = atob(padded);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  // Always return the pixel, whatever happens — never break the email render.
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("c");
    const email = decodeEmail(url.searchParams.get("e") || "");

    if (!campaignId || !email) return pixelResponse();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
    const now = new Date().toISOString();

    const { data: existing } = await supabase
      .from("marketing_email_opens")
      .select("id, open_count")
      .eq("campaign_id", campaignId)
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("marketing_email_opens")
        .update({ open_count: (existing.open_count ?? 1) + 1, last_opened_at: now })
        .eq("id", existing.id);
    } else {
      await supabase.from("marketing_email_opens").insert({
        campaign_id: campaignId,
        email,
        user_agent: userAgent,
      });
    }
  } catch (err) {
    console.error("[TRACK-EMAIL-OPEN]", err);
  }

  return pixelResponse();
});
