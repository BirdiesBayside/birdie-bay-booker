// One-shot restore: re-ingests orphaned CSVs from storage back into range_sessions/range_shots
// preserving the original session_id (= storage filename). Admin-only.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/[^\d.\-+eE]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [], rows: [] };
  const pl = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else { if (c === ',') { out.push(cur); cur = ""; } else if (c === '"') q = true; else cur += c; }
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  return { headers: pl(lines[0]), rows: lines.slice(1).map(pl) };
}
const canonical = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const FIELD_MAP: Record<string, string> = {
  shot: "shot_number", shotnumber: "shot_number", shotno: "shot_number", no: "shot_number", "#": "shot_number",
  time: "shot_timestamp", timestamp: "shot_timestamp", datetime: "shot_timestamp",
  club: "club_type", clubtype: "club_type", clubname: "club_type",
  ballspeed: "ball_speed", ballspeedmph: "ball_speed",
  clubspeed: "club_speed", clubheadspeed: "club_speed", clubspeedmph: "club_speed",
  smash: "smash_factor", smashfactor: "smash_factor",
  launchangle: "launch_angle", launch: "launch_angle", verticallaunch: "launch_angle", vla: "launch_angle",
  launchdirection: "launch_direction", horizontallaunch: "launch_direction", azimuth: "launch_direction", hla: "launch_direction",
  spin: "spin_rate", spinrate: "spin_rate", totalspin: "spin_rate", spinrpm: "spin_rate",
  spinaxis: "spin_axis", axis: "spin_axis", rawspinaxis: "spin_axis",
  backspin: "back_spin", sidespin: "side_spin",
  carry: "carry", carrydistance: "carry", carryyards: "carry",
  total: "total", totaldistance: "total", totalyards: "total",
  sidecarry: "side_carry", carryside: "side_carry", offlinecarry: "side_carry",
  side: "side_total", sidetotal: "side_total", offline: "side_carry",
  apex: "apex_height", apexheight: "apex_height", peakheight: "apex_height",
  descent: "descent_angle", decent: "descent_angle", descentangle: "descent_angle", landingangle: "descent_angle",
  aoa: "angle_of_attack", angleofattack: "angle_of_attack", attackangle: "angle_of_attack",
  clubpath: "club_path", path: "club_path",
  faceangle: "face_angle", face: "face_angle", facetotarget: "face_angle",
  facetopath: "face_to_path", ftp: "face_to_path",
};
const NUMERIC_COLS = new Set(["ball_speed","club_speed","smash_factor","launch_angle","launch_direction","spin_rate","spin_axis","back_spin","side_spin","carry","total","side_carry","side_total","apex_height","descent_angle","angle_of_attack","club_path","face_angle","face_to_path"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // List all csvs
  const { data: objs, error: listErr } = await admin.schema("storage").from("objects")
    .select("name, created_at").eq("bucket_id", (await admin.rpc as any) ? "range-session-csv" : "range-session-csv");
  // fallback: use direct storage list per prefix instead
  const restored: any[] = [];
  const skipped: any[] = [];

  // Fetch orphans via RPC-style query using storage.list
  // Simpler: caller passes list of {user_id, session_id, name} to restore
  const body = await req.json().catch(() => ({}));
  const items: { user_id: string; session_id: string; name: string; created_at?: string }[] = body.items ?? [];
  if (!items.length) return json({ error: "no_items" }, 400);

  for (const it of items) {
    try {
      // Check if session already exists
      const { data: existing } = await admin.from("range_sessions").select("id").eq("id", it.session_id).maybeSingle();
      if (existing) { skipped.push({ session_id: it.session_id, reason: "exists" }); continue; }

      const { data: file, error: dlErr } = await admin.storage.from("range-session-csv").download(it.name);
      if (dlErr || !file) { skipped.push({ session_id: it.session_id, reason: "download_failed", detail: dlErr?.message }); continue; }
      const csvText = await file.text();
      const { headers, rows } = parseCsv(csvText);
      if (!headers.length || !rows.length) { skipped.push({ session_id: it.session_id, reason: "empty" }); continue; }
      const colMap = headers.map((h) => FIELD_MAP[canonical(h)] ?? null);

      // Session date from CSV timestamps or storage created_at
      let sessionDate: string | null = null;
      let startedAt: string | null = null;
      let endedAt: string | null = null;

      const shotRows = rows.map((row, idx) => {
        const rec: Record<string, unknown> = { session_id: it.session_id, shot_number: idx + 1 };
        const raw: Record<string, string> = {};
        row.forEach((val, i) => {
          const key = colMap[i]; const hdr = headers[i]; raw[hdr] = val;
          if (!key) return;
          if (key === "shot_number") { const n = num(val); if (n !== null) rec.shot_number = n; }
          else if (key === "shot_timestamp") { const t = Date.parse(val); if (!Number.isNaN(t)) rec.shot_timestamp = new Date(t).toISOString(); }
          else if (key === "club_type") { if (val) rec.club_type = val; }
          else if (NUMERIC_COLS.has(key)) { const n = num(val); if (n !== null) rec[key] = n; }
        });
        if (rec.spin_rate == null) {
          const bs = rec.back_spin as number | undefined;
          const ss = (rec.side_spin as number | undefined) ?? 0;
          if (typeof bs === "number" && Number.isFinite(bs)) rec.spin_rate = Math.round(Math.sqrt(bs*bs + ss*ss));
        }
        rec.raw = raw;
        return rec;
      });

      const stamps = shotRows.map((r) => r.shot_timestamp as string | undefined).filter(Boolean).sort();
      startedAt = stamps[0] ?? null;
      endedAt = stamps[stamps.length - 1] ?? null;
      if (startedAt) {
        // Convert to Brisbane date
        const d = new Date(startedAt);
        const bris = new Date(d.getTime() + 10*3600*1000);
        sessionDate = bris.toISOString().slice(0,10);
      } else if (it.created_at) {
        const d = new Date(it.created_at);
        const bris = new Date(d.getTime() + 10*3600*1000);
        sessionDate = bris.toISOString().slice(0,10);
      }

      const insertPayload: Record<string, unknown> = {
        id: it.session_id,
        user_id: it.user_id,
        shot_count: shotRows.length,
        csv_path: it.name,
      };
      if (sessionDate) insertPayload.session_date = sessionDate;
      if (startedAt) insertPayload.started_at = startedAt;
      if (endedAt) insertPayload.ended_at = endedAt;
      if (startedAt && endedAt) insertPayload.duration_minutes = (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000;

      const { error: sErr } = await admin.from("range_sessions").insert(insertPayload);
      if (sErr) { skipped.push({ session_id: it.session_id, reason: "session_insert_failed", detail: sErr.message }); continue; }

      const CHUNK = 500;
      let shotErr: string | null = null;
      for (let i = 0; i < shotRows.length; i += CHUNK) {
        const { error } = await admin.from("range_shots").insert(shotRows.slice(i, i + CHUNK));
        if (error) { shotErr = error.message; break; }
      }
      if (shotErr) { skipped.push({ session_id: it.session_id, reason: "shots_failed", detail: shotErr }); continue; }

      restored.push({ session_id: it.session_id, user_id: it.user_id, shots: shotRows.length, session_date: sessionDate });
    } catch (e) {
      skipped.push({ session_id: it.session_id, reason: "exception", detail: String(e) });
    }
  }

  return json({ ok: true, restored_count: restored.length, skipped_count: skipped.length, restored, skipped });
});
