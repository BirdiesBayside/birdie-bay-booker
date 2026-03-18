import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-openclaw-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (action: string, msg: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[OPENCLAW-API][${action}] ${msg}${d}`);
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const respond = (data: any, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── Auth: validate OpenClaw API key ──
    const apiKey =
      req.headers.get("x-openclaw-key") ||
      req.headers.get("authorization")?.replace("Bearer ", "");

    const expectedKey = Deno.env.get("OPENCLAW_API_KEY");
    if (!expectedKey || apiKey !== expectedKey) {
      return respond({ error: "Unauthorized" }, 401);
    }

    // ── Supabase admin client (bypasses RLS) ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const body = await req.json();
    const { action, ...params } = body;

    if (!action) {
      return respond({ error: "Missing 'action' field" }, 400);
    }

    log(action, "Request received", params);

    // ═══════════════════════════════════════════
    //  READ ACTIONS
    // ═══════════════════════════════════════════

    // ── Daily Summary (Brisbane-aware, structured) ──
    if (action === "get-daily-summary") {
      const dateStr = params.date || getBrisbaneToday();
      const { start: dayStartUTC, end: dayEndUTC } = getBrisbaneDayBoundsUTC(dateStr);

      const [bookingsRes, posRes, membershipRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, total_price, status, payment_method, start_time, end_time, duration_hours, bay_id, user_id, stripe_payment_intent_id")
          .eq("booking_date", dateStr)
          .in("status", ["confirmed", "completed"]),
        supabase
          .from("pos_transactions")
          .select("id, total, payment_method, items, created_at")
          .gte("created_at", dayStartUTC)
          .lte("created_at", dayEndUTC),
        supabase
          .from("membership_payments")
          .select("id, amount, tier, paid_at, user_id, stripe_invoice_id")
          .gte("paid_at", dayStartUTC)
          .lte("paid_at", dayEndUTC),
      ]);

      const bookings = bookingsRes.data || [];
      const pos = posRes.data || [];
      const memberships = membershipRes.data || [];

      // Only count bookings where payment has actually been collected
      const paidBookings = bookings.filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);
      const pendingBookings = bookings.filter((b: any) => b.payment_method === "pending" || parseFloat(b.total_price) === 0);

      const bookingRevenue = paidBookings.reduce((s: number, b: any) => s + (parseFloat(b.total_price) || 0), 0);
      const posRevenue = pos.reduce((s: number, t: any) => s + (parseFloat(t.total) || 0), 0);
      const membershipRevenue = memberships.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);

      return respond({
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
          items: pos.map((t: any) => ({
            id: t.id,
            total: parseFloat(t.total),
            payment_method: t.payment_method,
            created_at: t.created_at,
          })),
        },
        memberships: {
          count: memberships.length,
          revenue: Math.round(membershipRevenue * 100) / 100,
          items: memberships.map((m: any) => ({
            id: m.id,
            amount: parseFloat(m.amount),
            tier: m.tier,
            paid_at: m.paid_at,
            stripe_invoice_id: m.stripe_invoice_id,
          })),
        },
        totals: {
          revenue: Math.round((bookingRevenue + posRevenue + membershipRevenue) * 100) / 100,
          booking_revenue: Math.round(bookingRevenue * 100) / 100,
          pos_revenue: Math.round(posRevenue * 100) / 100,
          membership_revenue: Math.round(membershipRevenue * 100) / 100,
        },
      });
    }

    // ── Range Summary (from/to, Brisbane-aware) ──
    if (action === "get-range-summary") {
      const today = getBrisbaneToday();
      const fromDate = params.from || today;
      const toDate = params.to || today;
      const { start: fromUTC } = getBrisbaneDayBoundsUTC(fromDate);
      const { end: toUTC } = getBrisbaneDayBoundsUTC(toDate);

      const [bookingsRes, posRes, membershipRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, total_price, status, booking_date, payment_method")
          .gte("booking_date", fromDate)
          .lte("booking_date", toDate)
          .in("status", ["confirmed", "completed"]),
        supabase
          .from("pos_transactions")
          .select("id, total, payment_method, created_at")
          .gte("created_at", fromUTC)
          .lte("created_at", toUTC),
        supabase
          .from("membership_payments")
          .select("id, amount, tier, paid_at")
          .gte("paid_at", fromUTC)
          .lte("paid_at", toUTC),
      ]);

      const bookings = (bookingsRes.data || []).filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);
      const pos = posRes.data || [];
      const memberships = membershipRes.data || [];

      const bookingRevenue = bookings.reduce((s: number, b: any) => s + (parseFloat(b.total_price) || 0), 0);
      const posRevenue = pos.reduce((s: number, t: any) => s + (parseFloat(t.total) || 0), 0);
      const membershipRevenue = memberships.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0);

      return respond({
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
      });
    }

    // ── Dashboard Stats (Brisbane-aware) ──
    if (action === "get-dashboard-stats") {
      const today = params.date || getBrisbaneToday();
      const thirtyDaysAgo = formatDateYMD(new Date(getBrisbaneDate(today).getTime() - 30 * 86400000));
      const { start: monthStartUTC } = getBrisbaneDayBoundsUTC(thirtyDaysAgo);
      const { end: todayEndUTC } = getBrisbaneDayBoundsUTC(today);

      const [bookingsToday, allProfiles, recentBookings, membershipPayments, posTransactions] =
        await Promise.all([
          supabase
            .from("bookings")
            .select("id, total_price, status, payment_method")
            .eq("booking_date", today)
            .in("status", ["confirmed", "completed"]),
          supabase
            .from("profiles")
            .select("membership_tier, deposit_balance, created_at"),
          supabase
            .from("bookings")
            .select("id, total_price, status, booking_date, payment_method")
            .in("status", ["confirmed", "completed"])
            .gte("booking_date", thirtyDaysAgo)
            .lte("booking_date", today)
            .order("booking_date", { ascending: false }),
          supabase
            .from("membership_payments")
            .select("amount, tier, paid_at")
            .gte("paid_at", monthStartUTC)
            .lte("paid_at", todayEndUTC)
            .order("paid_at", { ascending: false }),
          supabase
            .from("pos_transactions")
            .select("id, total, created_at")
            .gte("created_at", monthStartUTC)
            .lte("created_at", todayEndUTC),
        ]);

      const profiles = allProfiles.data || [];
      const tiers: Record<string, number> = {};
      profiles.forEach((p: any) => {
        tiers[p.membership_tier] = (tiers[p.membership_tier] || 0) + 1;
      });

      // Exclude pending/unpaid bookings from revenue
      const paidTodayBookings = (bookingsToday.data || []).filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);
      const paidRecentBookings = (recentBookings.data || []).filter((b: any) => b.payment_method !== "pending" && parseFloat(b.total_price) > 0);

      const todayRevenue = paidTodayBookings.reduce(
        (sum: number, b: any) => sum + (parseFloat(b.total_price) || 0), 0
      );
      const monthlyBookingRevenue = paidRecentBookings.reduce(
        (sum: number, b: any) => sum + (parseFloat(b.total_price) || 0), 0
      );
      const monthlyMembershipRevenue = (membershipPayments.data || []).reduce(
        (sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0
      );
      const monthlyPosRevenue = (posTransactions.data || []).reduce(
        (sum: number, t: any) => sum + (parseFloat(t.total) || 0), 0
      );

      return respond({
        date: today,
        timezone: "Australia/Brisbane",
        today: {
          bookings_count: paidTodayBookings.length,
          revenue: Math.round(todayRevenue * 100) / 100,
        },
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
      });
    }

    // ── Timetable / Bookings by date (Brisbane-aware) ──
    if (action === "get-timetable") {
      const date = params.date || getBrisbaneToday();
      
      // Fetch bookings and bays separately, then manually join profiles
      const [bookingsRes, baysRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, user_id, bay_id, booking_date, start_time, end_time, duration_hours, total_price, status, payment_method, notes, stripe_payment_intent_id, player_count")
          .eq("booking_date", date)
          .in("status", ["confirmed", "completed", "pending"])
          .order("start_time"),
        supabase.from("bays").select("id, name, bay_number"),
      ]);

      if (bookingsRes.error) throw new Error(bookingsRes.error.message);

      const bookings = bookingsRes.data || [];
      const baysMap: Record<string, any> = {};
      (baysRes.data || []).forEach((b: any) => { baysMap[b.id] = b; });

      // Get unique user_ids and fetch profiles
      const userIds = [...new Set(bookings.map((b: any) => b.user_id))];
      let profilesMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email, phone, membership_tier")
          .in("user_id", userIds);
        (profiles || []).forEach((p: any) => { profilesMap[p.user_id] = p; });
      }

      // Assemble response
      const enrichedBookings = bookings.map((b: any) => ({
        ...b,
        bay: baysMap[b.bay_id] || null,
        customer: profilesMap[b.user_id] || null,
      }));

      return respond({ date, timezone: "Australia/Brisbane", bookings: enrichedBookings });
    }

    // ── Get single booking ──
    if (action === "get-booking") {
      if (!params.booking_id) return respond({ error: "booking_id required" }, 400);
      
      // Fetch booking and bay, then manually get profile
      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("*, bays(name, bay_number)")
        .eq("id", params.booking_id)
        .single();

      if (bErr) throw new Error(bErr.message);

      // Get profile separately
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, last_name, email, phone, membership_tier, deposit_balance")
        .eq("user_id", booking.user_id)
        .maybeSingle();

      return respond({ booking: { ...booking, customer: profile } });
    }

    // ── Get customers (with search/filter) ──
    if (action === "get-customers") {
      let query = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (params.search) {
        query = query.or(
          `email.ilike.%${params.search}%,first_name.ilike.%${params.search}%,last_name.ilike.%${params.search}%`
        );
      }
      if (params.membership_tier) {
        query = query.eq("membership_tier", params.membership_tier);
      }
      if (params.limit) {
        query = query.limit(params.limit);
      } else {
        query = query.limit(100);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return respond({ customers: data, count: data?.length });
    }

    // ── Get single customer ──
    if (action === "get-customer") {
      if (!params.user_id && !params.email) return respond({ error: "user_id or email required" }, 400);

      let query = supabase.from("profiles").select("*");
      if (params.user_id) query = query.eq("user_id", params.user_id);
      else query = query.eq("email", params.email);

      const { data: profile, error } = await query.single();
      if (error) throw new Error(error.message);

      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_date, start_time, end_time, duration_hours, total_price, status, payment_method, stripe_payment_intent_id, bays(name)")
        .eq("user_id", profile.user_id)
        .order("booking_date", { ascending: false })
        .limit(20);

      const { data: transactions } = await supabase
        .from("deposit_transactions")
        .select("*")
        .eq("user_id", profile.user_id)
        .order("created_at", { ascending: false })
        .limit(20);

      return respond({ customer: profile, bookings, deposit_transactions: transactions });
    }

    // ── Bay status ──
    if (action === "get-bay-status") {
      const today = getBrisbaneToday();
      const [bays, devices, blocks] = await Promise.all([
        supabase.from("bays").select("*").order("bay_number"),
        supabase.from("bay_devices").select("*"),
        supabase.from("bay_blocks").select("*").gte("block_date", today),
      ]);

      return respond({
        bays: bays.data,
        devices: devices.data,
        upcoming_blocks: blocks.data,
      });
    }

    // ── League / SGT standings ──
    if (action === "get-league-standings") {
      const { data: tours } = await supabase
        .from("sgt_tours")
        .select("*")
        .eq("active", 1)
        .order("tour_id", { ascending: false });

      const tourId = params.tour_id || tours?.[0]?.tour_id;

      if (tourId) {
        const { data: standings } = await supabase
          .from("sgt_tour_standings")
          .select("*")
          .eq("tour_id", tourId)
          .order("position");

        return respond({ tour_id: tourId, standings });
      }

      return respond({ tours, message: "Provide tour_id for standings" });
    }

    // ── Membership payments ──
    if (action === "get-membership-payments") {
      let query = supabase
        .from("membership_payments")
        .select("*")
        .order("paid_at", { ascending: false });

      if (params.user_id) query = query.eq("user_id", params.user_id);
      if (params.limit) query = query.limit(params.limit);
      else query = query.limit(50);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return respond({ payments: data });
    }

    // ── POS transactions ──
    if (action === "get-pos-transactions") {
      let query = supabase
        .from("pos_transactions")
        .select("*")
        .order("created_at", { ascending: false });

      if (params.date) {
        const { start, end } = getBrisbaneDayBoundsUTC(params.date);
        query = query.gte("created_at", start).lte("created_at", end);
      }
      if (params.limit) query = query.limit(params.limit);
      else query = query.limit(50);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return respond({ transactions: data });
    }

    // ── Gift cards ──
    if (action === "get-gift-cards") {
      const { data, error } = await supabase
        .from("gift_cards")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(params.limit || 50);

      if (error) throw new Error(error.message);
      return respond({ gift_cards: data });
    }

    // ── Announcements ──
    if (action === "get-announcements") {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(params.limit || 20);

      if (error) throw new Error(error.message);
      return respond({ announcements: data });
    }

    // ── Bay controller logs ──
    if (action === "get-bay-logs") {
      let query = supabase
        .from("bay_controller_logs")
        .select("*")
        .order("created_at", { ascending: false });

      if (params.bay_number) query = query.eq("bay_number", params.bay_number);
      if (params.event_level) query = query.eq("event_level", params.event_level);
      query = query.limit(params.limit || 50);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return respond({ logs: data });
    }

    // ═══════════════════════════════════════════
    //  WRITE ACTIONS
    // ═══════════════════════════════════════════

    // ── Cancel booking (with refund) ──
    if (action === "cancel-booking") {
      if (!params.booking_id) return respond({ error: "booking_id required" }, 400);

      const { data: booking, error: bErr } = await supabase
        .from("bookings")
        .select("*")
        .eq("id", params.booking_id)
        .single();

      if (bErr || !booking) throw new Error(`Booking not found: ${bErr?.message}`);
      if (booking.status === "cancelled") return respond({ error: "Already cancelled" }, 400);

      let refundResult = null;

      if (booking.stripe_payment_intent_id && (booking.payment_method === "stripe" || booking.payment_method === "card")) {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          reason: "requested_by_customer",
        });
        refundResult = { type: "stripe", refund_id: refund.id, amount: refund.amount / 100, status: refund.status };
        log(action, "Stripe refund processed", refundResult);
      }

      if (booking.payment_method === "balance" || booking.payment_method === "partial") {
        const refundAmount = parseFloat(booking.total_price) || 0;
        if (refundAmount > 0) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("deposit_balance")
            .eq("user_id", booking.user_id)
            .single();

          const currentBalance = parseFloat(profile?.deposit_balance) || 0;
          const newBalance = currentBalance + refundAmount;

          await supabase
            .from("profiles")
            .update({ deposit_balance: newBalance })
            .eq("user_id", booking.user_id);

          refundResult = { type: "balance", amount: refundAmount, new_balance: newBalance };
          log(action, "Balance refund processed", refundResult);
        }
      }

      await supabase
        .from("bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", params.booking_id);

      if (params.send_notification !== false) {
        try {
          await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-booking-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ booking_id: params.booking_id, notification_type: "cancellation" }),
          });
        } catch (e) {
          log(action, "Notification failed (non-fatal)", { error: String(e) });
        }
      }

      return respond({ success: true, booking_id: params.booking_id, refund: refundResult });
    }

    // ── Cancel membership ──
    if (action === "cancel-membership") {
      if (!params.user_id) return respond({ error: "user_id required" }, 400);

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("email, membership_tier")
        .eq("user_id", params.user_id)
        .single();

      if (pErr || !profile) throw new Error("Profile not found");
      if (profile.membership_tier === "visitor") return respond({ error: "Already a visitor" }, 400);

      const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
      const customers = await stripe.customers.list({ email: profile.email, limit: 1 });

      let cancelledSubs: string[] = [];
      if (customers.data.length > 0) {
        const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: "active", limit: 10 });
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id);
          cancelledSubs.push(sub.id);
        }
      }

      await supabase
        .from("profiles")
        .update({ membership_tier: "visitor" })
        .eq("user_id", params.user_id);

      log(action, "Membership cancelled", { user_id: params.user_id, previous_tier: profile.membership_tier, cancelled_subs: cancelledSubs });
      return respond({ success: true, previous_tier: profile.membership_tier, cancelled_subscriptions: cancelledSubs });
    }

    // ── Create booking (admin-style) ──
    if (action === "create-booking") {
      const required = ["user_id", "bay_id", "booking_date", "start_time", "end_time", "duration_hours", "hourly_rate", "total_price"];
      for (const field of required) {
        if (!params[field]) return respond({ error: `${field} required` }, 400);
      }

      const { data, error } = await supabase
        .from("bookings")
        .insert({
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
          notes: params.notes || "Created via OpenClaw API",
        })
        .select()
        .single();

      if (error) throw new Error(`Failed to create booking: ${error.message}`);
      log(action, "Booking created", { booking_id: data.id });
      return respond({ success: true, booking: data });
    }

    // ── Add credit to customer balance ──
    if (action === "add-credit") {
      if (!params.user_id || !params.amount) return respond({ error: "user_id and amount required" }, 400);

      const amount = parseFloat(params.amount);
      if (isNaN(amount) || amount <= 0) return respond({ error: "Invalid amount" }, 400);

      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("deposit_balance")
        .eq("user_id", params.user_id)
        .single();

      if (pErr || !profile) throw new Error("Profile not found");

      const balanceBefore = parseFloat(profile.deposit_balance) || 0;
      const balanceAfter = balanceBefore + amount;

      await supabase
        .from("profiles")
        .update({ deposit_balance: balanceAfter })
        .eq("user_id", params.user_id);

      await supabase.from("deposit_transactions").insert({
        user_id: params.user_id,
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        transaction_type: "admin_credit",
        description: params.description || "Credit added via OpenClaw",
      });

      log(action, "Credit added", { user_id: params.user_id, amount, new_balance: balanceAfter });
      return respond({ success: true, balance_before: balanceBefore, balance_after: balanceAfter });
    }

    // ── Update membership tier ──
    if (action === "update-membership") {
      if (!params.user_id || !params.tier) return respond({ error: "user_id and tier required" }, 400);

      const validTiers = ["visitor", "weekday", "par", "birdie", "eagle", "albatross"];
      if (!validTiers.includes(params.tier)) return respond({ error: `Invalid tier. Valid: ${validTiers.join(", ")}` }, 400);

      const { data: profile } = await supabase
        .from("profiles")
        .select("membership_tier")
        .eq("user_id", params.user_id)
        .single();

      const { error } = await supabase
        .from("profiles")
        .update({ membership_tier: params.tier })
        .eq("user_id", params.user_id);

      if (error) throw new Error(error.message);

      log(action, "Membership updated", { user_id: params.user_id, from: profile?.membership_tier, to: params.tier });
      return respond({ success: true, previous_tier: profile?.membership_tier, new_tier: params.tier });
    }

    // ── Create announcement ──
    if (action === "create-announcement") {
      if (!params.title || !params.content) return respond({ error: "title and content required" }, 400);

      const { data, error } = await supabase
        .from("announcements")
        .insert({
          title: params.title,
          content: params.content,
          is_active: true,
          members_only: params.members_only || false,
          expires_at: params.expires_at || null,
          source_type: "openclaw",
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return respond({ success: true, announcement: data });
    }

    // ── Block a bay ──
    if (action === "block-bay") {
      if (!params.bay_id || !params.block_date || !params.start_time || !params.end_time)
        return respond({ error: "bay_id, block_date, start_time, end_time required" }, 400);

      const { data, error } = await supabase
        .from("bay_blocks")
        .insert({
          bay_id: params.bay_id,
          block_date: params.block_date,
          start_time: params.start_time,
          end_time: params.end_time,
          reason: params.reason || "Blocked via OpenClaw",
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return respond({ success: true, block: data });
    }

    // ── Unblock a bay ──
    if (action === "unblock-bay") {
      if (!params.block_id) return respond({ error: "block_id required" }, 400);

      const { error } = await supabase
        .from("bay_blocks")
        .delete()
        .eq("id", params.block_id);

      if (error) throw new Error(error.message);
      return respond({ success: true });
    }

    // ── Toggle membership hold ──
    if (action === "toggle-membership-hold") {
      if (!params.user_id && !params.email) return respond({ error: "user_id or email required" }, 400);
      if (typeof params.put_on_hold !== "boolean") return respond({ error: "put_on_hold (boolean) required" }, 400);

      // Resolve email from user_id if needed
      let email = params.email;
      let userId = params.user_id;
      if (!email && userId) {
        const { data: profile } = await supabase.from("profiles").select("email, user_id").eq("user_id", userId).single();
        if (!profile) return respond({ error: "Customer not found" }, 404);
        email = profile.email;
      }
      if (!userId && email) {
        const { data: profile } = await supabase.from("profiles").select("user_id").eq("email", email).single();
        if (profile) userId = profile.user_id;
      }

      // Update the database hold flag
      if (userId) {
        const { error: dbErr } = await supabase
          .from("profiles")
          .update({ membership_on_hold: params.put_on_hold })
          .eq("user_id", userId);
        if (dbErr) throw new Error(dbErr.message);
      }

      // Pause/resume Stripe subscriptions
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      let subscriptionsAffected = 0;
      if (stripeKey && email) {
        const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: "active", limit: 10 });
          for (const sub of subs.data) {
            if (params.put_on_hold) {
              await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "void" } });
            } else {
              await stripe.subscriptions.update(sub.id, { pause_collection: null as any });
            }
            subscriptionsAffected++;
          }
        }
      }

      log(action, params.put_on_hold ? "Membership put on hold" : "Membership resumed", { user_id: userId, email, subscriptionsAffected });
      return respond({
        success: true,
        on_hold: params.put_on_hold,
        message: params.put_on_hold
          ? `Membership paused${subscriptionsAffected > 0 ? ` — ${subscriptionsAffected} subscription(s) paused` : ""}`
          : `Membership resumed${subscriptionsAffected > 0 ? ` — ${subscriptionsAffected} subscription(s) resumed` : ""}`,
        subscriptions_affected: subscriptionsAffected,
      });
    }

    // ── List available actions ──
    if (action === "list-actions") {
      return respond({
        read_actions: [
          "get-daily-summary (date?) — Brisbane-aware daily revenue breakdown (bookings/POS/memberships) with line items. Excludes pending/unpaid bookings from revenue.",
          "get-range-summary (from?, to?) — Brisbane-aware revenue summary for a date range",
          "get-dashboard-stats (date?) — Overview stats with 30-day revenue split",
          "get-timetable (date?) — Bookings for a date with customer/bay details",
          "get-booking (booking_id) — Single booking detail with customer info",
          "get-customers (search?, membership_tier?, limit?) — Customer list",
          "get-customer (user_id | email) — Customer profile + recent bookings + deposits",
          "get-bay-status — Bay devices and upcoming blocks",
          "get-league-standings (tour_id?) — SGT tour leaderboard",
          "get-membership-payments (user_id?, limit?) — Membership payment history",
          "get-pos-transactions (date?, limit?) — POS transactions (date is Brisbane-aware)",
          "get-gift-cards (limit?) — Gift card list",
          "get-announcements (limit?) — Announcements",
          "get-bay-logs (bay_number?, event_level?, limit?) — Bay controller logs",
        ],
        write_actions: [
          "cancel-booking (booking_id, send_notification?)",
          "cancel-membership (user_id)",
          "create-booking (user_id, bay_id, booking_date, start_time, end_time, duration_hours, hourly_rate, total_price, player_count?, payment_method?, notes?)",
          "add-credit (user_id, amount, description?)",
          "update-membership (user_id, tier)",
          "create-announcement (title, content, members_only?, expires_at?)",
          "block-bay (bay_id, block_date, start_time, end_time, reason?)",
          "unblock-bay (block_id)",
        ],
        notes: {
          timezone: "All date parameters use YYYY-MM-DD in Australia/Brisbane timezone",
          currency: "AUD",
          revenue: "Revenue figures exclude bookings with payment_method='pending' or $0 total to avoid counting unpaid slots",
        },
      });
    }

    return respond({ error: `Unknown action: ${action}. Use action 'list-actions' to see available commands.` }, 400);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[OPENCLAW-API] Error:", msg);
    return respond({ error: msg }, 500);
  }
});
