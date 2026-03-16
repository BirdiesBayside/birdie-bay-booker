import { Hono } from "hono";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

// ── Brisbane date helpers ──
function getBrisbaneDate(dateStr?: string): Date {
  if (dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const now = new Date();
  const brisbaneStr = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [dd, mm, yyyy] = brisbaneStr.split("/").map(Number);
  return new Date(yyyy, mm - 1, dd);
}

function formatDateYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getBrisbaneDayBoundsUTC(dateStr: string): { start: string; end: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const startUTC = new Date(Date.UTC(y, m - 1, d, -10, 0, 0, 0));
  const endUTC = new Date(Date.UTC(y, m - 1, d, -10 + 23, 59, 59, 999));
  return { start: startUTC.toISOString(), end: endUTC.toISOString() };
}

function getBrisbaneToday(): string {
  return formatDateYMD(getBrisbaneDate());
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSupabase() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-openclaw-key, accept, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const log = (scope: string, msg: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[OPENCLAW-MCP][${scope}] ${msg}${d}`);
};

function ensureApiKey(req: Request) {
  const apiKey = req.headers.get("x-openclaw-key") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expectedKey = getEnv("OPENCLAW_API_KEY");
  if (apiKey !== expectedKey) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

type RegisteredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any) => Promise<any> | any;
};

const serverInfo = {
  name: "birdies-hub",
  version: "1.0.0",
};

const toolRegistry = new Map<string, RegisteredTool>();

const mcpServer = {
  tool(nameOrConfig: string | { name: string; description?: string; inputSchema?: Record<string, unknown>; handler: (args: any) => Promise<any> | any }, maybeConfig?: { description?: string; inputSchema?: Record<string, unknown>; handler: (args: any) => Promise<any> | any }) {
    const name = typeof nameOrConfig === "string" ? nameOrConfig : nameOrConfig.name;
    const config = typeof nameOrConfig === "string" ? maybeConfig : nameOrConfig;

    if (!name || !config?.handler) {
      throw new Error(`Invalid tool registration for ${name || "unknown"}`);
    }

    toolRegistry.set(name, {
      name,
      description: config.description || "",
      inputSchema: (config.inputSchema as Record<string, unknown>) || { type: "object", properties: {} },
      handler: config.handler,
    });

    return this;
  },
};

// ═══════════════════════════════════════════
//  READ TOOLS
// ═══════════════════════════════════════════

mcpServer.tool("get_daily_summary", {
  description: "Returns a Brisbane-aware daily breakdown of all revenue streams (bookings, POS, memberships) with line items and Stripe IDs for reconciliation. Revenue excludes pending/unpaid bookings.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Date in YYYY-MM-DD format (Brisbane time). Defaults to today." },
    },
  },
  handler: async ({ date }: { date?: string }) => {
    const supabase = getSupabase();
    const dateStr = date || getBrisbaneToday();
    const { start: dayStartUTC, end: dayEndUTC } = getBrisbaneDayBoundsUTC(dateStr);

    const [bookingsRes, posRes, membershipRes] = await Promise.all([
      supabase.from("bookings").select("id, total_price, status, payment_method, start_time, end_time, duration_hours, bay_id, user_id, stripe_payment_intent_id").eq("booking_date", dateStr).in("status", ["confirmed", "completed"]),
      supabase.from("pos_transactions").select("id, total, payment_method, items, created_at").gte("created_at", dayStartUTC).lte("created_at", dayEndUTC),
      supabase.from("membership_payments").select("id, amount, tier, paid_at, user_id, stripe_invoice_id").gte("paid_at", dayStartUTC).lte("paid_at", dayEndUTC),
    ]);

    const bookings = bookingsRes.data || [];
    const pos = posRes.data || [];
    const memberships = membershipRes.data || [];

    const paidBookings = bookings.filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);
    const pendingBookings = bookings.filter((b: any) => b.payment_method === "pending" || parseFloat(b.total_price) === 0);

    const bookingRevenue = paidBookings.reduce((s: number, b: any) => s + (parseFloat(b.total_price) || 0), 0);
    const posRevenue = pos.reduce((s: number, t: any) => s + (parseFloat(t.total) || 0), 0);
    const membershipRevenue = memberships.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);

    const result = {
      date: dateStr,
      timezone: "Australia/Brisbane",
      bookings: {
        count: paidBookings.length,
        revenue: Math.round(bookingRevenue * 100) / 100,
        pending_count: pendingBookings.length,
        items: bookings.map((b: any) => ({
          id: b.id,
          total_price: parseFloat(b.total_price),
          status: b.status,
          payment_method: b.payment_method,
          start_time: b.start_time,
          end_time: b.end_time,
          stripe_payment_intent_id: b.stripe_payment_intent_id,
        })),
      },
      pos: {
        count: pos.length,
        revenue: Math.round(posRevenue * 100) / 100,
        items: pos.map((t: any) => ({ id: t.id, total: parseFloat(t.total), payment_method: t.payment_method, created_at: t.created_at })),
      },
      memberships: {
        count: memberships.length,
        revenue: Math.round(membershipRevenue * 100) / 100,
        items: memberships.map((m: any) => ({ id: m.id, amount: parseFloat(m.amount), tier: m.tier, paid_at: m.paid_at, stripe_invoice_id: m.stripe_invoice_id })),
      },
      totals: {
        revenue: Math.round((bookingRevenue + posRevenue + membershipRevenue) * 100) / 100,
        booking_revenue: Math.round(bookingRevenue * 100) / 100,
        pos_revenue: Math.round(posRevenue * 100) / 100,
        membership_revenue: Math.round(membershipRevenue * 100) / 100,
      },
    };

    log("get_daily_summary", "Completed", { date: dateStr, total: result.totals.revenue });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});

mcpServer.tool("get_range_summary", {
  description: "Returns aggregated Brisbane-aware revenue totals for a date range across bookings, POS, and memberships.",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Start date YYYY-MM-DD. Defaults to today." },
      to: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
    },
  },
  handler: async ({ from, to }: { from?: string; to?: string }) => {
    const supabase = getSupabase();
    const today = getBrisbaneToday();
    const fromDate = from || today;
    const toDate = to || today;
    const { start: fromUTC } = getBrisbaneDayBoundsUTC(fromDate);
    const { end: toUTC } = getBrisbaneDayBoundsUTC(toDate);

    const [bookingsRes, posRes, membershipRes] = await Promise.all([
      supabase.from("bookings").select("id, total_price, status, booking_date, payment_method").gte("booking_date", fromDate).lte("booking_date", toDate).in("status", ["confirmed", "completed"]),
      supabase.from("pos_transactions").select("id, total, payment_method, created_at").gte("created_at", fromUTC).lte("created_at", toUTC),
      supabase.from("membership_payments").select("id, amount, tier, paid_at").gte("paid_at", fromUTC).lte("paid_at", toUTC),
    ]);

    const bookings = (bookingsRes.data || []).filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);
    const pos = posRes.data || [];
    const memberships = membershipRes.data || [];

    const bookingRevenue = bookings.reduce((s: number, b: any) => s + (parseFloat(b.total_price) || 0), 0);
    const posRevenue = pos.reduce((s: number, t: any) => s + (parseFloat(t.total) || 0), 0);
    const membershipRevenue = memberships.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);

    const result = {
      from: fromDate,
      to: toDate,
      timezone: "Australia/Brisbane",
      bookings: { count: bookings.length, revenue: Math.round(bookingRevenue * 100) / 100 },
      pos: { count: pos.length, revenue: Math.round(posRevenue * 100) / 100 },
      memberships: { count: memberships.length, revenue: Math.round(membershipRevenue * 100) / 100 },
      totals: {
        revenue: Math.round((bookingRevenue + posRevenue + membershipRevenue) * 100) / 100,
        booking_revenue: Math.round(bookingRevenue * 100) / 100,
        pos_revenue: Math.round(posRevenue * 100) / 100,
        membership_revenue: Math.round(membershipRevenue * 100) / 100,
      },
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});

mcpServer.tool("get_dashboard_stats", {
  description: "Returns a real-time business overview: today's bookings/revenue, 30-day revenue split (bookings/POS/memberships), membership breakdown by tier, and total customer count.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Reference date YYYY-MM-DD (Brisbane). Defaults to today." },
    },
  },
  handler: async ({ date }: { date?: string }) => {
    const supabase = getSupabase();
    const today = date || getBrisbaneToday();
    const thirtyDaysAgo = formatDateYMD(new Date(getBrisbaneDate(today).getTime() - 30 * 86400000));
    const { start: monthStartUTC } = getBrisbaneDayBoundsUTC(thirtyDaysAgo);
    const { end: todayEndUTC } = getBrisbaneDayBoundsUTC(today);

    const [bookingsToday, allProfiles, recentBookings, membershipPayments, posTransactions] = await Promise.all([
      supabase.from("bookings").select("id, total_price, status, payment_method").eq("booking_date", today).in("status", ["confirmed", "completed"]),
      supabase.from("profiles").select("membership_tier, deposit_balance, created_at"),
      supabase.from("bookings").select("id, total_price, status, booking_date, payment_method").in("status", ["confirmed", "completed"]).gte("booking_date", thirtyDaysAgo).lte("booking_date", today),
      supabase.from("membership_payments").select("amount, tier, paid_at").gte("paid_at", monthStartUTC).lte("paid_at", todayEndUTC),
      supabase.from("pos_transactions").select("id, total, created_at").gte("created_at", monthStartUTC).lte("created_at", todayEndUTC),
    ]);

    const profiles = allProfiles.data || [];
    const tiers: Record<string, number> = {};
    profiles.forEach((p: any) => {
      tiers[p.membership_tier] = (tiers[p.membership_tier] || 0) + 1;
    });

    const paidTodayBookings = (bookingsToday.data || []).filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);
    const paidRecentBookings = (recentBookings.data || []).filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);

    const todayRevenue = paidTodayBookings.reduce((sum: number, b: any) => sum + (parseFloat(b.total_price) || 0), 0);
    const monthlyBookingRevenue = paidRecentBookings.reduce((sum: number, b: any) => sum + (parseFloat(b.total_price) || 0), 0);
    const monthlyMembershipRevenue = (membershipPayments.data || []).reduce((sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0);
    const monthlyPosRevenue = (posTransactions.data || []).reduce((sum: number, t: any) => sum + (parseFloat(t.total) || 0), 0);

    const result = {
      date: today,
      timezone: "Australia/Brisbane",
      today: { bookings_count: paidTodayBookings.length, revenue: Math.round(todayRevenue * 100) / 100 },
      last_30_days: {
        from: thirtyDaysAgo,
        to: today,
        booking_revenue: Math.round(monthlyBookingRevenue * 100) / 100,
        pos_revenue: Math.round(monthlyPosRevenue * 100) / 100,
        membership_revenue: Math.round(monthlyMembershipRevenue * 100) / 100,
        total_revenue: Math.round((monthlyBookingRevenue + monthlyMembershipRevenue + monthlyPosRevenue) * 100) / 100,
        bookings_count: paidRecentBookings.length,
        pos_count: posTransactions.data?.length || 0,
      },
      membership_breakdown: tiers,
      total_customers: profiles.length,
      active_members: profiles.filter((p: any) => p.membership_tier !== "visitor").length,
    };

    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
});

mcpServer.tool("get_timetable", {
  description: "Returns all bookings for a specific date with customer details (name, email, membership tier) and bay info. Useful for seeing today's schedule.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Date YYYY-MM-DD (Brisbane). Defaults to today." },
    },
  },
  handler: async ({ date }: { date?: string }) => {
    const supabase = getSupabase();
    const dateStr = date || getBrisbaneToday();

    const [bookingsRes, baysRes] = await Promise.all([
      supabase.from("bookings").select("id, user_id, bay_id, booking_date, start_time, end_time, duration_hours, total_price, status, payment_method, notes, stripe_payment_intent_id, player_count").eq("booking_date", dateStr).in("status", ["confirmed", "completed", "pending"]).order("start_time"),
      supabase.from("bays").select("id, name, bay_number"),
    ]);

    const bookings = bookingsRes.data || [];
    const baysMap: Record<string, any> = {};
    (baysRes.data || []).forEach((b: any) => {
      baysMap[b.id] = b;
    });

    const userIds = [...new Set(bookings.map((b: any) => b.user_id))];
    const profilesMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("user_id, first_name, last_name, email, phone, membership_tier").in("user_id", userIds);
      (profiles || []).forEach((p: any) => {
        profilesMap[p.user_id] = p;
      });
    }

    const enrichedBookings = bookings.map((b: any) => ({ ...b, bay: baysMap[b.bay_id] || null, customer: profilesMap[b.user_id] || null }));
    return { content: [{ type: "text", text: JSON.stringify({ date: dateStr, timezone: "Australia/Brisbane", bookings: enrichedBookings }, null, 2) }] };
  },
});

mcpServer.tool("get_booking", {
  description: "Returns full details of a single booking including customer profile and bay info.",
  inputSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", description: "The booking UUID" },
    },
    required: ["booking_id"],
  },
  handler: async ({ booking_id }: { booking_id: string }) => {
    const supabase = getSupabase();
    const { data: booking, error } = await supabase.from("bookings").select("*, bays(name, bay_number)").eq("id", booking_id).single();
    if (error) throw new Error(error.message);

    const { data: profile } = await supabase.from("profiles").select("first_name, last_name, email, phone, membership_tier, deposit_balance").eq("user_id", booking.user_id).maybeSingle();
    return { content: [{ type: "text", text: JSON.stringify({ booking: { ...booking, customer: profile } }, null, 2) }] };
  },
});

mcpServer.tool("get_customers", {
  description: "Search and list customer profiles. Can filter by name/email search term and membership tier.",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "Search term for name or email" },
      membership_tier: { type: "string", description: "Filter by tier: visitor, weekday, par, birdie, eagle, albatross" },
      limit: { type: "number", description: "Max results (default 100)" },
    },
  },
  handler: async ({ search, membership_tier, limit }: { search?: string; membership_tier?: string; limit?: number }) => {
    const supabase = getSupabase();
    let query = supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (search) query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
    if (membership_tier) query = query.eq("membership_tier", membership_tier);
    query = query.limit(limit || 100);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ customers: data, count: data?.length }, null, 2) }] };
  },
});

mcpServer.tool("get_customer", {
  description: "Returns a single customer's full profile, recent bookings (last 20), and deposit transaction history. Lookup by user_id or email.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "The customer's auth user UUID" },
      email: { type: "string", description: "Customer email address" },
    },
  },
  handler: async ({ user_id, email }: { user_id?: string; email?: string }) => {
    if (!user_id && !email) throw new Error("user_id or email required");
    const supabase = getSupabase();
    let query = supabase.from("profiles").select("*");
    if (user_id) query = query.eq("user_id", user_id);
    else query = query.eq("email", email!);

    const { data: profile, error } = await query.single();
    if (error) throw new Error(error.message);

    const [bookingsRes, txRes] = await Promise.all([
      supabase.from("bookings").select("id, booking_date, start_time, end_time, duration_hours, total_price, status, payment_method, stripe_payment_intent_id, bays(name)").eq("user_id", profile.user_id).order("booking_date", { ascending: false }).limit(20),
      supabase.from("deposit_transactions").select("*").eq("user_id", profile.user_id).order("created_at", { ascending: false }).limit(20),
    ]);

    return { content: [{ type: "text", text: JSON.stringify({ customer: profile, bookings: bookingsRes.data, deposit_transactions: txRes.data }, null, 2) }] };
  },
});

mcpServer.tool("get_bay_status", {
  description: "Returns all bays, their device status (online/offline, plug state), and upcoming blocks.",
  inputSchema: { type: "object", properties: {} },
  handler: async () => {
    const supabase = getSupabase();
    const today = getBrisbaneToday();
    const [bays, devices, blocks] = await Promise.all([
      supabase.from("bays").select("*").order("bay_number"),
      supabase.from("bay_devices").select("*"),
      supabase.from("bay_blocks").select("*").gte("block_date", today),
    ]);
    return { content: [{ type: "text", text: JSON.stringify({ bays: bays.data, devices: devices.data, upcoming_blocks: blocks.data }, null, 2) }] };
  },
});

mcpServer.tool("get_league_standings", {
  description: "Returns SGT tour leaderboard standings. Defaults to the current active tour.",
  inputSchema: {
    type: "object",
    properties: {
      tour_id: { type: "number", description: "Tour ID. Defaults to current active tour." },
    },
  },
  handler: async ({ tour_id }: { tour_id?: number }) => {
    const supabase = getSupabase();
    const { data: tours } = await supabase.from("sgt_tours").select("*").eq("active", 1).order("tour_id", { ascending: false });
    const tid = tour_id || tours?.[0]?.tour_id;
    if (!tid) return { content: [{ type: "text", text: JSON.stringify({ tours, message: "No active tour found" }) }] };

    const { data: standings } = await supabase.from("sgt_tour_standings").select("*").eq("tour_id", tid).order("position");
    return { content: [{ type: "text", text: JSON.stringify({ tour_id: tid, standings }, null, 2) }] };
  },
});

mcpServer.tool("get_membership_payments", {
  description: "Returns membership payment history, optionally filtered by customer.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Filter by customer UUID" },
      limit: { type: "number", description: "Max results (default 50)" },
    },
  },
  handler: async ({ user_id, limit }: { user_id?: string; limit?: number }) => {
    const supabase = getSupabase();
    let query = supabase.from("membership_payments").select("*").order("paid_at", { ascending: false });
    if (user_id) query = query.eq("user_id", user_id);
    query = query.limit(limit || 50);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ payments: data }, null, 2) }] };
  },
});

mcpServer.tool("get_pos_transactions", {
  description: "Returns recent point-of-sale transactions. Optionally filter by date (Brisbane-aware).",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Filter by date YYYY-MM-DD (Brisbane)" },
      limit: { type: "number", description: "Max results (default 50)" },
    },
  },
  handler: async ({ date, limit }: { date?: string; limit?: number }) => {
    const supabase = getSupabase();
    let query = supabase.from("pos_transactions").select("*").order("created_at", { ascending: false });
    if (date) {
      const { start, end } = getBrisbaneDayBoundsUTC(date);
      query = query.gte("created_at", start).lte("created_at", end);
    }
    query = query.limit(limit || 50);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ transactions: data }, null, 2) }] };
  },
});

mcpServer.tool("get_gift_cards", {
  description: "Returns all gift cards and their status (pending/redeemed).",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Max results (default 50)" } },
  },
  handler: async ({ limit }: { limit?: number }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("gift_cards").select("*").order("created_at", { ascending: false }).limit(limit || 50);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ gift_cards: data }, null, 2) }] };
  },
});

mcpServer.tool("get_announcements", {
  description: "Returns current and past in-app announcements.",
  inputSchema: {
    type: "object",
    properties: { limit: { type: "number", description: "Max results (default 20)" } },
  },
  handler: async ({ limit }: { limit?: number }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(limit || 20);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ announcements: data }, null, 2) }] };
  },
});

mcpServer.tool("get_bay_logs", {
  description: "Returns bay controller event logs for diagnostics. Filter by bay number and severity.",
  inputSchema: {
    type: "object",
    properties: {
      bay_number: { type: "number", description: "Filter by bay number" },
      event_level: { type: "string", description: "Filter: info, warn, error" },
      limit: { type: "number", description: "Max results (default 50)" },
    },
  },
  handler: async ({ bay_number, event_level, limit }: { bay_number?: number; event_level?: string; limit?: number }) => {
    const supabase = getSupabase();
    let query = supabase.from("bay_controller_logs").select("*").order("created_at", { ascending: false });
    if (bay_number) query = query.eq("bay_number", bay_number);
    if (event_level) query = query.eq("event_level", event_level);
    query = query.limit(limit || 50);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ logs: data }, null, 2) }] };
  },
});

// ═══════════════════════════════════════════
//  WRITE TOOLS
// ═══════════════════════════════════════════

mcpServer.tool("cancel_booking", {
  description: "Cancels a booking and automatically processes the appropriate refund (Stripe card refund or deposit balance credit). Sends cancellation email by default.",
  inputSchema: {
    type: "object",
    properties: {
      booking_id: { type: "string", description: "The booking UUID to cancel" },
      send_notification: { type: "boolean", description: "Send cancellation email (default true)" },
    },
    required: ["booking_id"],
  },
  handler: async ({ booking_id, send_notification }: { booking_id: string; send_notification?: boolean }) => {
    const supabase = getSupabase();
    const { data: booking, error: bErr } = await supabase.from("bookings").select("*").eq("id", booking_id).single();
    if (bErr || !booking) throw new Error(`Booking not found: ${bErr?.message}`);
    if (booking.status === "cancelled") throw new Error("Already cancelled");

    let refundResult: any = null;

    if (booking.stripe_payment_intent_id && (booking.payment_method === "stripe" || booking.payment_method === "card")) {
      const stripe = new Stripe(getEnv("STRIPE_SECRET_KEY"), { apiVersion: "2025-08-27.basil" });
      const refund = await stripe.refunds.create({ payment_intent: booking.stripe_payment_intent_id, reason: "requested_by_customer" });
      refundResult = { type: "stripe", refund_id: refund.id, amount: refund.amount / 100, status: refund.status };
    }

    if (booking.payment_method === "balance" || booking.payment_method === "partial") {
      const refundAmount = parseFloat(booking.total_price) || 0;
      if (refundAmount > 0) {
        const { data: profile } = await supabase.from("profiles").select("deposit_balance").eq("user_id", booking.user_id).single();
        const currentBalance = parseFloat(profile?.deposit_balance) || 0;
        const newBalance = currentBalance + refundAmount;
        await supabase.from("profiles").update({ deposit_balance: newBalance }).eq("user_id", booking.user_id);
        refundResult = { type: "balance", amount: refundAmount, new_balance: newBalance };
      }
    }

    await supabase.from("bookings").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", booking_id);

    if (send_notification !== false) {
      try {
        await fetch(`${getEnv("SUPABASE_URL")}/functions/v1/send-booking-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getEnv("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ booking_id, notification_type: "cancellation" }),
        });
      } catch (e) {
        log("cancel_booking", "Notification failed (non-fatal)", { error: String(e) });
      }
    }

    return { content: [{ type: "text", text: JSON.stringify({ success: true, booking_id, refund: refundResult }, null, 2) }] };
  },
});

mcpServer.tool("cancel_membership", {
  description: "Cancels a customer's membership — cancels all active Stripe subscriptions and downgrades to 'visitor' tier.",
  inputSchema: {
    type: "object",
    properties: { user_id: { type: "string", description: "Customer's auth user UUID" } },
    required: ["user_id"],
  },
  handler: async ({ user_id }: { user_id: string }) => {
    const supabase = getSupabase();
    const { data: profile, error: pErr } = await supabase.from("profiles").select("email, membership_tier").eq("user_id", user_id).single();
    if (pErr || !profile) throw new Error("Profile not found");
    if (profile.membership_tier === "visitor") throw new Error("Already a visitor");

    const stripe = new Stripe(getEnv("STRIPE_SECRET_KEY"), { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
    const cancelledSubs: string[] = [];
    if (customers.data.length > 0) {
      const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: "active", limit: 10 });
      for (const sub of subs.data) {
        await stripe.subscriptions.cancel(sub.id);
        cancelledSubs.push(sub.id);
      }
    }

    await supabase.from("profiles").update({ membership_tier: "visitor" }).eq("user_id", user_id);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, previous_tier: profile.membership_tier, cancelled_subscriptions: cancelledSubs }, null, 2) }] };
  },
});

mcpServer.tool("create_booking", {
  description: "Creates a new confirmed booking (admin-style, no payment processing). Will fail if the time slot overlaps with an existing booking.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Customer's auth user UUID" },
      bay_id: { type: "string", description: "Bay UUID" },
      booking_date: { type: "string", description: "Date YYYY-MM-DD" },
      start_time: { type: "string", description: "Start time HH:MM (24hr)" },
      end_time: { type: "string", description: "End time HH:MM (24hr)" },
      duration_hours: { type: "number", description: "Duration in hours (e.g. 1, 2)" },
      hourly_rate: { type: "number", description: "Rate per hour in AUD" },
      total_price: { type: "number", description: "Total price in AUD" },
      player_count: { type: "number", description: "Number of players (default 1)" },
      payment_method: { type: "string", description: "Payment method (default 'admin')" },
      notes: { type: "string", description: "Booking notes" },
    },
    required: ["user_id", "bay_id", "booking_date", "start_time", "end_time", "duration_hours", "hourly_rate", "total_price"],
  },
  handler: async (params: any) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("bookings").insert({
      user_id: params.user_id,
      bay_id: params.bay_id,
      booking_date: params.booking_date,
      start_time: params.start_time,
      end_time: params.end_time,
      duration_hours: params.duration_hours,
      hourly_rate: params.hourly_rate,
      total_price: params.total_price,
      player_count: params.player_count || 1,
      status: "confirmed",
      payment_method: params.payment_method || "admin",
      notes: params.notes || "Created via OpenClaw MCP",
    }).select().single();
    if (error) throw new Error(`Failed to create booking: ${error.message}`);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, booking: data }, null, 2) }] };
  },
});

mcpServer.tool("add_credit", {
  description: "Adds deposit credit to a customer's balance. Records a transaction for audit trail.",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Customer's auth user UUID" },
      amount: { type: "number", description: "Dollar amount to add (AUD)" },
      description: { type: "string", description: "Reason for the credit" },
    },
    required: ["user_id", "amount"],
  },
  handler: async ({ user_id, amount, description }: { user_id: string; amount: number; description?: string }) => {
    if (amount <= 0) throw new Error("Amount must be positive");
    const supabase = getSupabase();
    const { data: profile, error: pErr } = await supabase.from("profiles").select("deposit_balance").eq("user_id", user_id).single();
    if (pErr || !profile) throw new Error("Profile not found");

    const balanceBefore = parseFloat(profile.deposit_balance) || 0;
    const balanceAfter = balanceBefore + amount;
    await supabase.from("profiles").update({ deposit_balance: balanceAfter }).eq("user_id", user_id);
    await supabase.from("deposit_transactions").insert({ user_id, amount, balance_before: balanceBefore, balance_after: balanceAfter, transaction_type: "admin_credit", description: description || "Credit added via OpenClaw" });

    return { content: [{ type: "text", text: JSON.stringify({ success: true, balance_before: balanceBefore, balance_after: balanceAfter }, null, 2) }] };
  },
});

mcpServer.tool("update_membership", {
  description: "Changes a customer's membership tier directly (manual override — does NOT handle Stripe subscriptions).",
  inputSchema: {
    type: "object",
    properties: {
      user_id: { type: "string", description: "Customer's auth user UUID" },
      tier: { type: "string", description: "New tier: visitor, weekday, par, birdie, eagle, albatross" },
    },
    required: ["user_id", "tier"],
  },
  handler: async ({ user_id, tier }: { user_id: string; tier: string }) => {
    const validTiers = ["visitor", "weekday", "par", "birdie", "eagle", "albatross"];
    if (!validTiers.includes(tier)) throw new Error(`Invalid tier. Valid: ${validTiers.join(", ")}`);
    const supabase = getSupabase();
    const { data: profile } = await supabase.from("profiles").select("membership_tier").eq("user_id", user_id).single();
    const { error } = await supabase.from("profiles").update({ membership_tier: tier }).eq("user_id", user_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, previous_tier: profile?.membership_tier, new_tier: tier }, null, 2) }] };
  },
});

mcpServer.tool("create_announcement", {
  description: "Creates a new in-app announcement visible to customers.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Announcement title" },
      content: { type: "string", description: "Announcement body text" },
      members_only: { type: "boolean", description: "Only show to members (default false)" },
      expires_at: { type: "string", description: "Auto-expire ISO datetime (optional)" },
    },
    required: ["title", "content"],
  },
  handler: async ({ title, content, members_only, expires_at }: { title: string; content: string; members_only?: boolean; expires_at?: string }) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("announcements").insert({ title, content, is_active: true, members_only: members_only || false, expires_at: expires_at || null, source_type: "openclaw" }).select().single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, announcement: data }, null, 2) }] };
  },
});

mcpServer.tool("block_bay", {
  description: "Blocks a bay for a specific date and time range (e.g. maintenance, private events).",
  inputSchema: {
    type: "object",
    properties: {
      bay_id: { type: "string", description: "Bay UUID" },
      block_date: { type: "string", description: "Date YYYY-MM-DD" },
      start_time: { type: "string", description: "Start time HH:MM" },
      end_time: { type: "string", description: "End time HH:MM" },
      reason: { type: "string", description: "Reason for block" },
    },
    required: ["bay_id", "block_date", "start_time", "end_time"],
  },
  handler: async ({ bay_id, block_date, start_time, end_time, reason }: any) => {
    const supabase = getSupabase();
    const { data, error } = await supabase.from("bay_blocks").insert({ bay_id, block_date, start_time, end_time, reason: reason || "Blocked via OpenClaw" }).select().single();
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ success: true, block: data }, null, 2) }] };
  },
});

mcpServer.tool("unblock_bay", {
  description: "Removes a bay block by its ID.",
  inputSchema: {
    type: "object",
    properties: { block_id: { type: "string", description: "Block UUID to remove" } },
    required: ["block_id"],
  },
  handler: async ({ block_id }: { block_id: string }) => {
    const supabase = getSupabase();
    const { error } = await supabase.from("bay_blocks").delete().eq("id", block_id);
    if (error) throw new Error(error.message);
    return { content: [{ type: "text", text: JSON.stringify({ success: true }) }] };
  },
});

// ── MCP JSON-RPC HTTP endpoint ──
const app = new Hono();

function jsonRpcResult(id: unknown, result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonRpcError(id: unknown, code: number, message: string, status = 500) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

app.use("*", async (c, next) => {
  if (c.req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    ensureApiKey(c.req.raw);
    await next();
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    log("auth", "Request auth/config failed", {
      error: error instanceof Error ? error.message : String(error),
      method: c.req.method,
      path: c.req.path,
    });

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Authentication/configuration error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

app.get("*", (c) => {
  return c.json({
    name: serverInfo.name,
    transport: "streamable-http",
    status: "ok",
    tools: toolRegistry.size,
  }, { headers: corsHeaders });
});

app.post("*", async (c) => {
  let body: any;

  try {
    body = await c.req.json();
  } catch {
    return jsonRpcError(null, -32700, "Invalid JSON", 400);
  }

  const { id = null, method, params } = body ?? {};

  log("rpc", "Incoming MCP request", {
    method,
    path: c.req.path,
    contentType: c.req.header("content-type") || null,
    accept: c.req.header("accept") || null,
  });

  try {
    switch (method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: "2025-03-26",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo,
        });

      case "notifications/initialized":
        return new Response(null, { status: 202, headers: corsHeaders });

      case "ping":
        return jsonRpcResult(id, {});

      case "tools/list":
        return jsonRpcResult(id, {
          tools: Array.from(toolRegistry.values()).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          })),
        });

      case "tools/call": {
        const toolName = params?.name;
        const args = params?.arguments || {};
        const tool = toolRegistry.get(toolName);

        if (!tool) {
          return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`, 404);
        }

        const result = await tool.handler(args);
        return jsonRpcResult(id, result);
      }

      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`, 404);
    }
  } catch (error) {
    log("rpc", "Unhandled MCP error", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
      method,
    });

    return jsonRpcError(id, -32603, error instanceof Error ? error.message : "Internal MCP server error", 500);
  }
});

Deno.serve(app.fetch);
