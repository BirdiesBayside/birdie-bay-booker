// Bay Controller endpoint for per-customer GSPro settings snapshots.
// GET  ?user_id=...&file=dpsV2x3.gss|Settings.vgs -> { exists, base64? }
// POST body { user_id, file, base64 } -> saves to gspro-user-settings/{user_id}/{file}
// Auth: caller must be signed-in admin.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const ALLOWED_FILES = new Set(["dpsV2x3.gss", "Settings.vgs"]);
const BUCKET = "gspro-user-settings";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userRes, error: userErr } = await authClient.auth.getUser();
  if (userErr || !userRes?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userRes.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const file = url.searchParams.get("file") ?? "";
    if (!userId || !ALLOWED_FILES.has(file)) return json({ error: "bad_request" }, 400);
    const path = `${userId}/${file}`;
    const { data, error } = await admin.storage.from(BUCKET).download(path);
    if (error || !data) return json({ exists: false });
    const buf = new Uint8Array(await data.arrayBuffer());
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    return json({ exists: true, base64: btoa(bin) });
  }

  if (req.method === "POST") {
    let body: any;
    try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
    const { user_id, file, base64 } = body ?? {};
    if (!user_id || !ALLOWED_FILES.has(file) || typeof base64 !== "string") return json({ error: "bad_request" }, 400);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)); }
    catch { return json({ error: "invalid_base64" }, 400); }
    // Baseline-hash comparison happens client-side in the Bay Controller;
    // any file that reaches this point is a genuine user-modified snapshot.
    const path = `${user_id}/${file}`;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { upsert: true, contentType: "application/octet-stream" });
    if (error) return json({ error: "upload_failed", detail: error.message }, 500);
    return json({ ok: true, path });
  }

  return json({ error: "method_not_allowed" }, 405);
});
