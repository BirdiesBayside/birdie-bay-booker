// Tags recording_holes rows with highlight events based on SGT scoring.
// Runs on cron and can be triggered from Admin > Highlights.
//
// SGT's API does not expose per-shot data for course play, so this v2 runs
// score-based rules only (birdie, eagle, hole-in-one). Shot-distance rules
// (hole-outs, long drives, darts) were removed — see .lovable/plan.md.

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HoleRow {
  id: string;
  hole_number: number;
  par: number | null;
  score: number | null;
  recording_session_id: string;
}

const RULES: Array<{ key: string; label: string; emoji: string; match: (h: HoleRow) => boolean }> = [
  { key: "hole_in_one", label: "Hole in One", emoji: "🏆", match: (h) => h.par === 3 && h.score === 1 },
  { key: "albatross", label: "Albatross", emoji: "🦩", match: (h) => h.par != null && h.score != null && (h.score - h.par) === -3 },
  { key: "eagle", label: "Eagle", emoji: "🦅", match: (h) => h.par != null && h.score != null && (h.score - h.par) === -2 && !(h.par === 3 && h.score === 1) },
  { key: "birdie", label: "Birdie", emoji: "🐦", match: (h) => h.par != null && h.score != null && (h.score - h.par) === -1 },
];

function tagHole(hole: HoleRow) {
  const out: Array<{ rule_key: string; tag_label: string; tag_emoji: string; shot_index: number | null; metric_value: number | null; metric_unit: string | null }> = [];
  for (const r of RULES) {
    if (r.match(hole)) {
      out.push({ rule_key: r.key, tag_label: r.label, tag_emoji: r.emoji, shot_index: null, metric_value: null, metric_unit: null });
      break; // one score-based tag per hole (highest tier wins by order above)
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let body: { recording_session_id?: string; hole_id?: string } = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { /* cron */ } }

  const cols = "id,hole_number,par,score,recording_session_id";
  let holesQuery = supabase.from("recording_holes").select(cols);

  if (body.hole_id) {
    holesQuery = holesQuery.eq("id", body.hole_id);
  } else if (body.recording_session_id) {
    holesQuery = holesQuery.eq("recording_session_id", body.recording_session_id);
  } else {
    // ad-hoc cron: last 24h
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    holesQuery = holesQuery.gte("updated_at", since);
  }

  const { data: holes, error: holesErr } = await holesQuery;
  if (holesErr) return new Response(JSON.stringify({ error: holesErr.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let totalEvents = 0;
  for (const hole of (holes ?? []) as HoleRow[]) {
    if (hole.score == null || hole.par == null) continue; // hole not scored yet
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
