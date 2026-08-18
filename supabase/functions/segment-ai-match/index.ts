// Matches pasted CSV / free-form text (or a plain-English description) to customers
// in the profiles table so an admin can approve them into a marketing segment.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

interface Profile {
  email: string;
  first_name: string | null;
  last_name: string | null;
  membership_tier: string | null;
  total_bookings: number | null;
  created_at: string | null;
}

async function fetchAllProfiles(): Promise<Profile[]> {
  const all: Profile[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await admin
      .from("profiles")
      .select("email, first_name, last_name, membership_tier, total_bookings, created_at")
      .not("email", "is", null)
      .range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as Profile[]));
    if (data.length < size) break;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { text } = await req.json();
    const raw = String(text ?? "").trim();
    if (!raw) {
      return new Response(JSON.stringify({ error: "text required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (raw.length > 60000) {
      return new Response(JSON.stringify({ error: "Input too large (60k character limit)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const profiles = await fetchAllProfiles();
    const byEmail = new Map(profiles.map((p) => [norm(p.email), p]));

    const matches = new Map<string, { profile: Profile; reason: string }>();
    const unmatched: string[] = [];

    // 1. Deterministic pass: direct email hits in the pasted text.
    const emailsInText = Array.from(
      new Set((raw.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).map(norm)),
    );
    for (const e of emailsInText) {
      const p = byEmail.get(e);
      if (p) matches.set(norm(p.email), { profile: p, reason: "Exact email match" });
      else unmatched.push(e);
    }

    // 2. AI pass for names / descriptions when there is more than just emails.
    const leftovers = raw
      .split(/[\n;]+/)
      .map((l) => l.trim())
      .filter((l) => l && !emailsInText.some((e) => norm(l).includes(e)));

    if (leftovers.length > 0) {
      const roster = profiles
        .map(
          (p) =>
            `${p.email}|${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() +
            `|${p.membership_tier ?? "visitor"}|${p.total_bookings ?? 0} bookings|joined ${(p.created_at ?? "").slice(0, 10)}`,
        )
        .join("\n");

      const prompt = `You match customer records for a golf venue's marketing tool.

CUSTOMER ROSTER (email|name|tier|bookings|joined):
${roster}

ADMIN INPUT (may be CSV rows, a list of names, or a plain-English description of who to target):
${leftovers.join("\n")}

Return ONLY the customers from the roster that the admin input refers to. Use exact emails from the roster. If the input is a description (e.g. "eagle members who have booked more than 5 times"), apply it as a filter. Never invent emails. If you are unsure about a name, still include your best candidate but say so in the reason.`;

      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          tools: [
            {
              type: "function",
              function: {
                name: "return_matches",
                description: "Return the matched customers",
                parameters: {
                  type: "object",
                  properties: {
                    matches: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          email: { type: "string" },
                          reason: { type: "string" },
                        },
                        required: ["email", "reason"],
                        additionalProperties: false,
                      },
                    },
                    unmatched: { type: "array", items: { type: "string" } },
                  },
                  required: ["matches"],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "return_matches" } },
        }),
      });

      if (res.status === 429 || res.status === 402) {
        return new Response(
          JSON.stringify({
            error: res.status === 429 ? "AI rate limit reached, try again shortly." : "AI credits exhausted.",
          }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (!res.ok) {
        const body = await res.text();
        console.error("AI gateway error", res.status, body);
        return new Response(JSON.stringify({ error: "AI matching failed." }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const json = await res.json();
      const call = json?.choices?.[0]?.message?.tool_calls?.[0];
      let parsed: any = {};
      try {
        parsed = JSON.parse(call?.function?.arguments ?? "{}");
      } catch (_) {
        parsed = {};
      }
      for (const m of parsed.matches ?? []) {
        const p = byEmail.get(norm(m.email));
        if (p && !matches.has(norm(p.email))) {
          matches.set(norm(p.email), { profile: p, reason: m.reason || "AI match" });
        }
      }
      for (const u of parsed.unmatched ?? []) unmatched.push(String(u));
    }

    return new Response(
      JSON.stringify({
        matches: Array.from(matches.values()).map(({ profile, reason }) => ({
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          membership_tier: profile.membership_tier,
          reason,
        })),
        unmatched: Array.from(new Set(unmatched)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("segment-ai-match error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
