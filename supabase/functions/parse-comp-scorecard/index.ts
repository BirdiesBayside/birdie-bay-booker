// Reads an already-stored GSPro scorecard screenshot for a recording session
// and extracts a structured scorecard (same shape as SGT-sourced scorecards).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const BUCKET = "comp-scorecards";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const scorecardTool = {
  type: "function",
  function: {
    name: "submit_scorecard",
    description: "Return the golf scorecard read from the screenshot.",
    parameters: {
      type: "object",
      properties: {
        player_name: { type: "string", description: "Player or team name shown, if any" },
        course_name: { type: "string" },
        total_gross: { type: "number" },
        pars: {
          type: "array",
          description: "Par for holes 1-18 in order. Use 0 if unreadable.",
          items: { type: "number" },
        },
        scores: {
          type: "array",
          description: "Gross strokes for holes 1-18 in order. Use 0 if the hole was not played.",
          items: { type: "number" },
        },
        confidence: { type: "number", description: "0-1 confidence the read is accurate" },
      },
      required: ["scores", "pars"],
      additionalProperties: false,
    },
  },
};

async function parseScorecard(dataUrl: string) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LOVABLE_API_KEY}` },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        {
          role: "system",
          content:
            "You read golf simulator (GSPro) scorecard screenshots and return the data exactly as shown. Never invent strokes. Holes with no score get 0.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extract the scorecard from this GSPro screenshot. Return par and gross strokes for holes 1-18 in order, plus the course name, player/team name and total gross if visible.",
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [scorecardTool],
      tool_choice: { type: "function", function: { name: "submit_scorecard" } },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI gateway ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const call = data?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) throw new Error("AI returned no scorecard");
  return JSON.parse(call.function.arguments) as {
    player_name?: string;
    course_name?: string;
    total_gross?: number;
    pars?: number[];
    scores?: number[];
    confidence?: number;
  };
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null) as
      | { recording_session_id?: string; force?: boolean }
      | null;
    const sessionId = body?.recording_session_id;
    if (!sessionId) return json({ error: "recording_session_id required" }, 400);

    const { data: session, error: sessErr } = await admin
      .from("recording_sessions")
      .select("id, player_name, scorecard, scorecard_image_path, scorecard_source")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessErr) throw new Error(sessErr.message);
    if (!session) return json({ error: "session not found" }, 404);
    if (!session.scorecard_image_path) return json({ error: "no scorecard screenshot on this session" }, 400);

    // Don't overwrite an SGT-sourced scorecard unless forced.
    const existing = session.scorecard as Record<string, unknown> | null;
    if (existing && !body?.force) {
      return json({ success: true, skipped: true, scorecard: existing });
    }

    const { data: file, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(session.scorecard_image_path);
    if (dlErr || !file) throw new Error(`download failed: ${dlErr?.message ?? "no file"}`);

    const b64 = toBase64(new Uint8Array(await file.arrayBuffer()));
    const ai = await parseScorecard(`data:image/png;base64,${b64}`);

    const scores = (ai.scores ?? []).slice(0, 18);
    const pars = (ai.pars ?? []).slice(0, 18);
    const holeData: Record<string, number> = {};
    for (let h = 1; h <= 18; h++) {
      holeData[`h${h}_Par`] = Number(pars[h - 1] ?? 0) || 0;
      holeData[`hole${h}_gross`] = Number(scores[h - 1] ?? 0) || 0;
    }
    const outGross = scores.slice(0, 9).reduce((s, v) => s + (Number(v) || 0), 0);
    const inGross = scores.slice(9, 18).reduce((s, v) => s + (Number(v) || 0), 0);
    const totalGross = Number(ai.total_gross) || outGross + inGross;
    const parTotal = pars.reduce((s, v) => s + (Number(v) || 0), 0);

    const scorecard = {
      player_name: ai.player_name ?? session.player_name ?? null,
      course_name: ai.course_name ?? null,
      total_gross: totalGross || null,
      to_par_gross: parTotal ? totalGross - parTotal : null,
      out_gross: outGross || null,
      in_gross: inGross || null,
      hole_data: holeData,
      source: "screenshot",
      confidence: ai.confidence ?? null,
      fetched_at: new Date().toISOString(),
    };

    const { error: updErr } = await admin
      .from("recording_sessions")
      .update({ scorecard, scorecard_source: "screenshot" })
      .eq("id", sessionId);
    if (updErr) throw new Error(`session update failed: ${updErr.message}`);

    console.log(
      `[parse-comp-scorecard] session=${sessionId} gross=${scorecard.total_gross} to_par=${scorecard.to_par_gross} conf=${scorecard.confidence}`,
    );

    return json({ success: true, scorecard });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[parse-comp-scorecard]", msg);
    return json({ error: msg }, 500);
  }
});
