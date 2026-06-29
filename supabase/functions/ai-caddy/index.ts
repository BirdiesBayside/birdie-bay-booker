// AI Caddy — admin/staff support assistant
// Non-streaming chat with tool-calling. Uses Lovable AI Gateway.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2025-07-30.basil" });

// ---------- Tool definitions (OpenAI-compatible) ----------
const tools = [
  {
    type: "function",
    function: {
      name: "find_customer",
      description: "Find a customer by email, phone, or name. Returns up to 5 matching profiles with id, name, email, phone, membership_tier, deposit_balance, total_bookings, payment_failed_at, booking_flag_enabled.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "email, phone (any format), or full/partial name" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_bookings",
      description: "List recent bookings for a customer by user_id (uuid). Default last 20.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          limit: { type: "number", description: "default 20, max 100" },
        },
        required: ["user_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_booking",
      description: "Get a single booking by id with bay name and customer details.",
      parameters: { type: "object", properties: { booking_id: { type: "string" } }, required: ["booking_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_edge_logs",
      description: "Fetch recent rows from an internal log table. Allowed tables: adhoc_sms_log, bay_controller_logs, deposit_transactions, membership_changes, membership_payments, local_hcp_adjustments. Default limit 25.",
      parameters: {
        type: "object",
        properties: {
          table: { type: "string", enum: ["adhoc_sms_log", "bay_controller_logs", "deposit_transactions", "membership_changes", "membership_payments", "local_hcp_adjustments"] },
          filter_column: { type: "string", description: "optional eq filter column" },
          filter_value: { type: "string", description: "optional eq filter value" },
          limit: { type: "number" },
        },
        required: ["table"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stripe_events_for_customer",
      description: "List recent Stripe charges/refunds/subscription events for a customer by email. Returns up to 15 items.",
      parameters: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sgt_status",
      description: "Get current active SGT tour & tournament, plus the user's registration / scorecard if user_id is given.",
      parameters: { type: "object", properties: { user_id: { type: "string", description: "optional" } } },
    },
  },
  // -------- ACTIONS (require confirmed=true) --------
  {
    type: "function",
    function: {
      name: "refund_booking",
      description: "Refund a booking via Stripe and mark cancelled. DESTRUCTIVE — requires confirmed=true. If amount_cents omitted, full refund.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string" },
          amount_cents: { type: "number", description: "optional partial refund in cents" },
          reason: { type: "string" },
          confirmed: { type: "boolean", description: "must be true to actually execute" },
        },
        required: ["booking_id", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_customer_credit",
      description: "Add or deduct deposit_balance for a customer. DESTRUCTIVE — requires confirmed=true. Use negative amount to deduct.",
      parameters: {
        type: "object",
        properties: {
          user_id: { type: "string" },
          amount: { type: "number", description: "dollars, can be negative" },
          note: { type: "string" },
          confirmed: { type: "boolean" },
        },
        required: ["user_id", "amount", "note"],
      },
    },
  },
];

// ---------- Tool executors ----------
async function execTool(name: string, args: any, userId: string, threadId: string | null) {
  const log = async (status: string, result: any) => {
    await admin.from("ai_caddy_actions").insert({
      thread_id: threadId, user_id: userId, tool_name: name, args, result, status,
    });
  };

  try {
    switch (name) {
      case "find_customer": {
        const q = String(args.query || "").trim();
        if (!q) return { error: "empty query" };
        const orFilter = `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`;
        const { data, error } = await admin
          .from("profiles")
          .select("id,user_id,first_name,last_name,email,phone,membership_tier,deposit_balance,total_bookings,payment_failed_at,booking_flag_enabled")
          .or(orFilter)
          .limit(5);
        if (error) return { error: error.message };
        return { matches: data };
      }
      case "get_customer_bookings": {
        const limit = Math.min(args.limit ?? 20, 100);
        const { data, error } = await admin
          .from("bookings")
          .select("id,booking_date,start_time,end_time,bay_id,status,total_price,player_count,created_at,stripe_payment_intent_id")
          .eq("user_id", args.user_id)
          .order("booking_date", { ascending: false })
          .limit(limit);
        if (error) return { error: error.message };
        return { bookings: data };
      }
      case "get_booking": {
        const { data: b, error } = await admin
          .from("bookings")
          .select("*, bays(name), profiles!bookings_user_id_fkey(first_name,last_name,email,phone)")
          .eq("id", args.booking_id)
          .maybeSingle();
        if (error) return { error: error.message };
        return { booking: b };
      }
      case "get_recent_edge_logs": {
        const allowed = ["adhoc_sms_log","bay_controller_logs","deposit_transactions","membership_changes","membership_payments","local_hcp_adjustments"];
        if (!allowed.includes(args.table)) return { error: "table not allowed" };
        let q = admin.from(args.table).select("*").order("created_at", { ascending: false }).limit(Math.min(args.limit ?? 25, 100));
        if (args.filter_column && args.filter_value) q = q.eq(args.filter_column, args.filter_value);
        const { data, error } = await q;
        if (error) return { error: error.message };
        return { rows: data };
      }
      case "get_stripe_events_for_customer": {
        const customers = await stripe.customers.list({ email: args.email, limit: 3 });
        if (!customers.data.length) return { error: "no stripe customer", email: args.email };
        const cid = customers.data[0].id;
        const [charges, refunds, subs] = await Promise.all([
          stripe.charges.list({ customer: cid, limit: 10 }),
          stripe.refunds.list({ limit: 10 }),
          stripe.subscriptions.list({ customer: cid, limit: 5 }),
        ]);
        return {
          customer_id: cid,
          charges: charges.data.map(c => ({ id: c.id, amount: c.amount/100, status: c.status, created: new Date(c.created*1000).toISOString(), description: c.description, refunded: c.refunded })),
          recent_refunds: refunds.data.filter(r => r.charge && charges.data.some(c => c.id === r.charge)).map(r => ({ id: r.id, amount: (r.amount||0)/100, status: r.status, reason: r.reason })),
          subscriptions: subs.data.map(s => ({ id: s.id, status: s.status, current_period_end: new Date(s.current_period_end*1000).toISOString() })),
        };
      }
      case "get_sgt_status": {
        const today = new Date().toISOString().slice(0,10);
        const { data: tours } = await admin.from("sgt_tours").select("*").gte("end_date", today).order("end_date", { ascending: true }).limit(1);
        const tour = tours?.[0];
        if (!tour) return { active_tour: null };
        const { data: tournaments } = await admin.from("sgt_tournaments").select("*").eq("tour_id", tour.id).order("created_at", { ascending: false }).limit(3);
        let registration = null, scorecard = null;
        if (args.user_id) {
          const { data: prof } = await admin.from("profiles").select("email").eq("user_id", args.user_id).maybeSingle();
          if (prof?.email) {
            const { data: member } = await admin.from("sgt_members").select("*").eq("email", prof.email.toLowerCase()).maybeSingle();
            if (member) {
              const { data: tm } = await admin.from("sgt_tour_members").select("*").eq("tour_id", tour.id).eq("user_id", member.sgt_user_id).maybeSingle();
              registration = tm;
              if (tournaments?.[0]) {
                const { data: sc } = await admin.from("sgt_scorecards").select("*").eq("tournament_id", tournaments[0].id).eq("sgt_user_id", member.sgt_user_id).maybeSingle();
                scorecard = sc;
              }
            }
          }
        }
        return { active_tour: tour, recent_tournaments: tournaments, registration, scorecard };
      }
      case "refund_booking": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const { data: b } = await admin.from("bookings").select("*").eq("id", args.booking_id).maybeSingle();
        if (!b) { const r = { error: "booking not found" }; await log("error", r); return r; }
        if (!b.stripe_payment_intent_id) { const r = { error: "no stripe payment intent on this booking" }; await log("error", r); return r; }
        const refund = await stripe.refunds.create({
          payment_intent: b.stripe_payment_intent_id,
          ...(args.amount_cents ? { amount: args.amount_cents } : {}),
          reason: "requested_by_customer",
          metadata: { booking_id: b.id, ai_caddy_reason: args.reason, admin_user_id: userId },
        });
        await admin.from("bookings").update({ status: "cancelled" }).eq("id", b.id);
        const result = { ok: true, refund_id: refund.id, amount: (refund.amount||0)/100, booking_id: b.id };
        await log("success", result);
        return result;
      }
      case "adjust_customer_credit": {
        if (!args.confirmed) return { pending_confirmation: true, message: "Awaiting user confirmation. Re-invoke with confirmed=true after user agrees." };
        const { data: prof } = await admin.from("profiles").select("user_id,deposit_balance").eq("user_id", args.user_id).maybeSingle();
        if (!prof) { const r = { error: "profile not found" }; await log("error", r); return r; }
        const before = Number(prof.deposit_balance || 0);
        const after = before + Number(args.amount);
        await admin.from("profiles").update({ deposit_balance: after }).eq("user_id", args.user_id);
        await admin.from("deposit_transactions").insert({
          user_id: args.user_id, amount: args.amount, balance_before: before, balance_after: after,
          transaction_type: "admin_adjustment", description: `AI Caddy: ${args.note}`,
        });
        const result = { ok: true, before, after, delta: args.amount };
        await log("success", result);
        return result;
      }
      default:
        return { error: "unknown tool" };
    }
  } catch (e: any) {
    const r = { error: e?.message ?? String(e) };
    await log("error", r);
    return r;
  }
}

const SYSTEM_PROMPT = `You are AI Caddy, the in-admin support assistant for Birdies Bayside.

You help admin & staff users investigate issues and perform a vetted list of safe actions. You CANNOT change code, schemas, or settings — you ONLY use the tools provided.

Rules:
- Always cite the data row IDs you used (booking id, user id, stripe id) in your final answer.
- For DESTRUCTIVE tools (refund_booking, adjust_customer_credit), first call the tool WITHOUT confirmed=true to surface a preview, then tell the user exactly what will happen ("I'm about to refund $87.50 to Monica Kennell on booking abc123. Reply 'confirm' to proceed.") and wait for them to say confirm/yes/do it before re-calling with confirmed=true.
- Never reveal secrets, env vars, or raw SQL.
- Never invent data. If a tool returns nothing, say so.
- Keep replies short. Markdown allowed.
- All times are Australia/Brisbane (AEST/UTC+10).
- If asked to do something outside your tools (bulk ops, code changes, schema, deleting customers), refuse and explain why.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "no auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Role/segment check
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    let allowed = isAdmin === true;
    if (!allowed) {
      const { data: prof } = await admin.from("profiles").select("custom_segment").eq("user_id", user.id).maybeSingle();
      allowed = prof?.custom_segment === "staff";
    }
    if (!allowed) return new Response(JSON.stringify({ error: "not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { messages, thread_id } = await req.json();
    if (!Array.isArray(messages)) return new Response(JSON.stringify({ error: "messages required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Tool-call loop
    const convo: any[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    const toolCallsTrace: any[] = [];
    for (let step = 0; step < 12; step++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": LOVABLE_API_KEY,
          "X-Lovable-AIG-SDK": "direct-fetch",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: convo,
          tools,
          tool_choice: "auto",
        }),
      });
      if (res.status === 429) return new Response(JSON.stringify({ error: "rate_limited", message: "AI rate limit hit — wait a moment and try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 402) return new Response(JSON.stringify({ error: "credits_exhausted", message: "AI credits exhausted. Add credits in Workspace settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!res.ok) {
        const txt = await res.text();
        return new Response(JSON.stringify({ error: "gateway_error", status: res.status, detail: txt }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const data = await res.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) return new Response(JSON.stringify({ error: "no choice" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      convo.push(msg);

      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          let parsedArgs: any = {};
          try { parsedArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}
          const result = await execTool(tc.function.name, parsedArgs, user.id, thread_id ?? null);
          toolCallsTrace.push({ id: tc.id, name: tc.function.name, args: parsedArgs, result });
          convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue;
      }
      // Final assistant text
      return new Response(JSON.stringify({
        assistant: msg.content ?? "",
        tool_calls: toolCallsTrace,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: "max steps reached", tool_calls: toolCallsTrace }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[ai-caddy] error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
