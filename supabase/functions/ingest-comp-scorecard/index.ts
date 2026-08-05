// Receives a GSPro scorecard screenshot captured by the Bay Controller,
// stores the image, and uses AI vision to extract a structured scorecard
// in the same shape as the SGT-sourced scorecards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-bay-number, x-action",
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
    },
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null) as
      | { bay_number?: number; image_base64?: string; recording_session_id?: string; parse?: boolean }
      | null;

    const bayNumber = Number(body?.bay_number ?? req.headers.get("x-bay-number"));
    const imageB64 = (body?.image_base64 || "").replace(/^data:image\/\w+;base64,/, "");
    if (!imageB64) return json({ error: "image_base64 required" }, 400);
    if (!body?.recording_session_id && !Number.isFinite(bayNumber)) {
      return json({ error: "bay_number or recording_session_id required" }, 400);
    }

    // Resolve the session this screenshot belongs to.
    let sessionId = body?.recording_session_id ?? null;
    let session: { id: string; bay_number: number; trigger_source: string; player_name: string | null } | null = null;

    if (sessionId) {
      const { data } = await admin
        .from("recording_sessions")
        .select("id, bay_number, trigger_source, player_name")
        .eq("id", sessionId)
        .maybeSingle();
      session = data as typeof session;
    } else {
      // Prefer a live recording on this bay, otherwise the most recent one from today.
      const { data: live } = await admin
        .from("recording_sessions")
        .select("id, bay_number, trigger_source, player_name")
        .eq("bay_number", bayNumber)
        .eq("status", "recording")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      session = (live as typeof session) ?? null;

      if (!session) {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        const { data: recent } = await admin
          .from("recording_sessions")
          .select("id, bay_number, trigger_source, player_name")
          .eq("bay_number", bayNumber)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        session = (recent as typeof session) ?? null;
      }
      sessionId = session?.id ?? null;
    }

    // No live/recent recording session (e.g. testing during a normal round):
    // still store the image and parse it so the read can be verified.
    const testMode = !sessionId;

    // Store the raw screenshot (always kept, even if parsing fails).
    const bytes = Uint8Array.from(atob(imageB64), (c) => c.charCodeAt(0));
    const path = testMode
      ? `test/bay-${Number.isFinite(bayNumber) ? bayNumber : "unknown"}/${Date.now()}.png`
      : `${sessionId}/${Date.now()}.png`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (upErr) throw new Error(`upload failed: ${upErr.message}`);

    const update: Record<string, unknown> = {
      scorecard_image_path: path,
      scorecard_source: "screenshot",
      scorecard_captured_at: new Date().toISOString(),
    };

    let parsed: Record<string, unknown> | null = null;
    let parseError: string | null = null;

    if (body?.parse !== false) {
      try {
        const ai = await parseScorecard(`data:image/png;base64,${imageB64}`);
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

        parsed = {
          player_name: ai.player_name ?? session?.player_name ?? null,
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
        update.scorecard = parsed;
      } catch (e) {
        parseError = e instanceof Error ? e.message : String(e);
        console.error("[ingest-comp-scorecard] parse failed:", parseError);
      }
    }

    const { error: updErr } = await admin
      .from("recording_sessions")
      .update(update)
      .eq("id", sessionId);
    if (updErr) throw new Error(`session update failed: ${updErr.message}`);

    return json({
      success: true,
      recording_session_id: sessionId,
      image_path: path,
      parsed: parsed ? true : false,
      parse_error: parseError,
      scorecard: parsed,
      player_name: session?.player_name ?? null,
      trigger_source: session?.trigger_source ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ingest-comp-scorecard]", msg);
    return json({ error: msg }, 500);
  }
});
