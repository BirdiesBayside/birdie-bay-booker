// One-shot admin restore: re-ingests a range_sessions row (and its shots) from
// an archived CSV in the private `range-session-csv` bucket. Used to recover
// sessions accidentally deleted via the SwingLab trash button. Uses the same
// parsing logic as bay-controller-api / ingest-range-session.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const s = String(v).trim().replace(/[^\d.\-+eE]/g, "");
  if (s === "" || s === "-" || s === "+") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
function parseCsv(text: string) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) return { headers: [] as string[], rows: [] as string[][] };
  const parseLine = (line: string): string[] => {
    const out: string[] = []; let cur = ""; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i+1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
      else { if (c === ',') { out.push(cur); cur = ""; } else if (c === '"') q = true; else cur += c; }
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  return { headers: parseLine(lines[0]), rows: lines.slice(1).map(parseLine) };
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
function parseFilenameDate(name: string | null): { date: string; iso: string } | null {
  if (!name) return null;
  const m = String(name).match(/(\d{2})-(\d{2})-(\d{2})-(\d{1,2})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, mm, dd, yy, hh, mi, ss] = m;
  const year = 2000 + Number(yy);
  const utcMs = Date.UTC(year, Number(mm) - 1, Number(dd), Number(hh) - 10, Number(mi), Number(ss));
  if (!Number.isFinite(utcMs)) return null;
  return { date: `${year}-${mm}-${dd}`, iso: new Date(utcMs).toISOString() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  // One-shot admin restore tool. No auth check — function is deleted after use.


  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const paths: string[] = Array.isArray(body?.paths) ? body.paths : [];
  const bookingMap: Record<string, string | null> = body?.booking_ids ?? {};
  const bayMap: Record<string, string | null> = body?.bay_ids ?? {};
  if (!paths.length) return json({ error: "missing_paths" }, 400);

  const results: any[] = [];
  for (const path of paths) {
    const userId = path.split("/")[0];
    if (!userId) { results.push({ path, error: "bad_path" }); continue; }
    const { data: blob, error: dlErr } = await admin.storage.from("range-session-csv").download(path);
    if (dlErr || !blob) { results.push({ path, error: dlErr?.message ?? "download_failed" }); continue; }
    const csvText = await blob.text();
    const { headers, rows } = parseCsv(csvText);
    if (!headers.length || !rows.length) { results.push({ path, error: "empty_csv" }); continue; }
    const colMap = headers.map((h) => FIELD_MAP[canonical(h)] ?? null);

    // Try derive filename from path (uuid.csv → no date; look for gspro-export in raw?)
    // We fall back to today; started_at is overwritten later from shot timestamps if present.
    const filenameStamp = parseFilenameDate(body?.filenames?.[path] ?? null);

    const { data: session, error: sessErr } = await admin
      .from("range_sessions")
      .insert({
        user_id: userId,
        booking_id: bookingMap[path] ?? null,
        bay_id: bayMap[path] ?? null,
        shot_count: rows.length,
        source_filename: body?.filenames?.[path] ?? null,
        csv_path: path,
        ...(filenameStamp ? { session_date: filenameStamp.date, started_at: filenameStamp.iso } : {}),
      })
      .select("id")
      .single();
    if (sessErr || !session) { results.push({ path, error: "session_insert_failed", detail: sessErr?.message }); continue; }
    const sessionId = session.id;

    const NUMERIC = new Set(["ball_speed","club_speed","smash_factor","launch_angle","launch_direction","spin_rate","spin_axis","back_spin","side_spin","carry","total","side_carry","side_total","apex_height","descent_angle","angle_of_attack","club_path","face_angle","face_to_path"]);
    const shotRows = rows.map((row, idx) => {
      const rec: Record<string, unknown> = { session_id: sessionId, shot_number: idx + 1 };
      const raw: Record<string, string> = {};
      row.forEach((val, i) => {
        const key = colMap[i]; const hdr = headers[i]; raw[hdr] = val;
        if (!key) return;
        if (key === "shot_number") { const n = num(val); if (n !== null) rec.shot_number = n; }
        else if (key === "shot_timestamp") { const t = Date.parse(val); if (!Number.isNaN(t)) rec.shot_timestamp = new Date(t).toISOString(); }
        else if (key === "club_type") { if (val) rec.club_type = val; }
        else if (NUMERIC.has(key)) { const n = num(val); if (n !== null) rec[key] = n; }
      });
      if (rec.spin_rate == null) {
        const bs = rec.back_spin as number | undefined;
        const ss = (rec.side_spin as number | undefined) ?? 0;
        if (typeof bs === "number" && Number.isFinite(bs)) rec.spin_rate = Math.round(Math.sqrt(bs*bs + ss*ss));
      }
      rec.raw = raw;
      return rec;
    });

    const CHUNK = 500;
    let insErr: any = null;
    for (let i = 0; i < shotRows.length; i += CHUNK) {
      const { error } = await admin.from("range_shots").insert(shotRows.slice(i, i + CHUNK));
      if (error) { insErr = error; break; }
    }
    if (insErr) { results.push({ path, session_id: sessionId, error: "shot_insert_failed", detail: insErr.message }); continue; }

    const stamps = shotRows.map((r) => r.shot_timestamp as string | undefined).filter(Boolean).sort();
    const started = stamps[0] ?? null;
    const ended = stamps[stamps.length - 1] ?? null;
    const durationMin = started && ended ? (new Date(ended).getTime() - new Date(started).getTime()) / 60000 : null;
    const upd: Record<string, unknown> = {};
    if (started) upd.started_at = started;
    if (ended) upd.ended_at = ended;
    if (durationMin != null) upd.duration_minutes = durationMin;
    if (Object.keys(upd).length) await admin.from("range_sessions").update(upd).eq("id", sessionId);

    results.push({ path, session_id: sessionId, shot_count: shotRows.length });
  }

  return json({ ok: true, results });
});
