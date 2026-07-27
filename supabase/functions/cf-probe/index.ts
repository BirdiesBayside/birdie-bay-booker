// TEMPORARY diagnostic: probe Cloudflare Stream video status by uid.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const { uids } = await req.json().catch(() => ({ uids: [] }));
  const accountId = (Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "").trim();
  const token = (Deno.env.get("CLOUDFLARE_STREAM_API_TOKEN") ?? "").trim();
  const out: unknown[] = [];
  for (const uid of uids ?? []) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    const v = (json as any).result;
    let dl: unknown = null;
    if (v?.status?.state === "ready") {
      const dlRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}/downloads`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const dlJson = await dlRes.json().catch(() => ({}));
      dl = (dlJson as any).result?.default ?? (dlJson as any).errors ?? null;
    }
    out.push({
      uid,
      http: res.status,
      state: v?.status?.state ?? null,
      pctComplete: v?.status?.pctComplete ?? null,
      errorReasonText: v?.status?.errorReasonText ?? null,
      duration: v?.duration ?? null,
      size: v?.size ?? null,
      uploaded: v?.uploaded ?? null,
      readyToStream: v?.readyToStream ?? null,
      meta: v?.meta ?? null,
      download: dl,
      errors: (json as any).errors ?? null,
    });
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
