// Tags recording_holes rows with highlight events based on SGT scoring + shot timeline.
// Runs on cron every 15 minutes and can be triggered ad-hoc from Admin > Highlights.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ShotEvent {
  shot_index: number;
  ts_offset_seconds: number; // seconds from hole clip_start
  club?: string;
  distance_m?: number;
  remaining_m?: number;
  proximity_m?: number; // distance from pin after shot
  holed?: boolean;
}

interface HoleRow {
  id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
  shot_timeline: ShotEvent[] | null;
  recording_session_id: string;
}

const RULES: Array<{
  key: string;
  label: string;
  emoji: string;
  match: (h: HoleRow, s: ShotEvent | null) => { hit: boolean; value?: number; unit?: string };
}> = [
  { key: "hole_out_long", label: "Hole-Out From Distance", emoji: "🎯",
    match: (_h, s) => ({ hit: !!s?.holed && (s?.distance_m ?? 0) >= 30, value: s?.distance_m, unit: "m" }) },
  { key: "eagle", label: "Eagle", emoji: "🦅",
    match: (h) => ({ hit: h.par != null && h.score != null && (h.score - h.par) <= -2 }) },
  { key: "hole_in_one", label: "Hole in One", emoji: "🏆",
    match: (h) => ({ hit: h.par === 3 && h.score === 1 }) },
  { key: "long_drive", label: "Long Drive", emoji: "💥",
    match: (_h, s) => ({ hit: (s?.club?.toLowerCase().includes("driver") ?? false) && (s?.distance_m ?? 0) >= 300, value: s?.distance_m, unit: "m" }) },
  { key: "dart", label: "Dart Approach", emoji: "🎯",
    match: (_h, s) => ({ hit: (s?.distance_m ?? 0) >= 100 && (s?.proximity_m ?? 999) <= 2, value: s?.proximity_m, unit: "m" }) },
  { key: "birdie", label: "Birdie", emoji: "🐦",
    match: (h) => ({ hit: h.par != null && h.score != null && (h.score - h.par) === -1 }) },
];

function tagHole(hole: HoleRow) {
  const events: Array<{ rule_key: string; tag_label: string; tag_emoji: string; shot_index: number | null; metric_value: number | null; metric_unit: string | null }> = [];
  const shots = hole.shot_timeline ?? [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    // Whole-hole rules (no shot context)
    const holeRes = rule.match(hole, null);
    if (holeRes.hit && !seen.has(rule.key)) {
      events.push({ rule_key: rule.key, tag_label: rule.label, tag_emoji: rule.emoji, shot_index: null, metric_value: holeRes.value ?? null, metric_unit: holeRes.unit ?? null });
      seen.add(rule.key);
    }
    for (const s of shots) {
      const res = rule.match(hole, s);
      if (res.hit) {
        const dedupe = `${rule.key}:${s.shot_index}`;
        if (seen.has(dedupe)) continue;
        events.push({ rule_key: rule.key, tag_label: rule.label, tag_emoji: rule.emoji, shot_index: s.shot_index, metric_value: res.value ?? null, metric_unit: res.unit ?? null });
        seen.add(dedupe);
      }
    }
  }
  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: { recording_session_id?: string; hole_id?: string } = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* cron */ } }

  // Select holes: specific, or all recent uploaded holes not yet tagged
  let holesQuery = supabase.from("recording_holes").select("id,hole_number,par,score,shot_timeline,recording_session_id").eq("status", "uploaded");
  if (body.hole_id) holesQuery = supabase.from("recording_holes").select("id,hole_number,par,score,shot_timeline,recording_session_id").eq("id", body.hole_id);
  else if (body.recording_session_id) holesQuery = holesQuery.eq("recording_session_id", body.recording_session_id);
  else {
    // ad-hoc cron: last 24h only
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    holesQuery = holesQuery.gte("updated_at", since);
  }

  const { data: holes, error: holesErr } = await holesQuery;
  if (holesErr) return new Response(JSON.stringify({ error: holesErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let totalEvents = 0;
  for (const hole of (holes ?? []) as HoleRow[]) {
    // Clear existing tags for idempotency
    await supabase.from("highlight_events").delete().eq("recording_hole_id", hole.id);
    const events = tagHole(hole);
    if (events.length > 0) {
      const rows = events.map((e) => ({ ...e, recording_hole_id: hole.id }));
      const { error: insErr } = await supabase.from("highlight_events").insert(rows);
      if (insErr) console.error(`[tagger] insert failed for hole ${hole.id}:`, insErr.message);
      else totalEvents += events.length;
    }
  }

  return new Response(JSON.stringify({ ok: true, holes_processed: holes?.length ?? 0, events_created: totalEvents }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
