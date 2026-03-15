import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "npm:stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-openclaw-key",
};

const log = (action: string, msg: string, details?: any) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[OPENCLAW-API][${action}] ${msg}${d}`);
};

serve(async (req) => {
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

    // ── Dashboard Stats ──
    if (action === "get-dashboard-stats") {
      const today = new Date().toISOString().split("T")[0];

      const [bookingsToday, allProfiles, recentBookings, membershipPayments] =
        await Promise.all([
          supabase
            .from("bookings")
            .select("id, total_price, status")
            .eq("booking_date", today)
            .in("status", ["confirmed", "completed"]),
          supabase
            .from("profiles")
            .select("membership_tier, deposit_balance, created_at"),
          supabase
            .from("bookings")
            .select("id, total_price, status, booking_date, created_at")
            .in("status", ["confirmed", "completed"])
            .gte("booking_date", new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0])
            .order("booking_date", { ascending: false }),
          supabase
            .from("membership_payments")
            .select("amount, tier, paid_at")
            .gte("paid_at", new Date(Date.now() - 30 * 86400000).toISOString())
            .order("paid_at", { ascending: false }),
        ]);

      const profiles = allProfiles.data || [];
      const tiers: Record<string, number> = {};
      profiles.forEach((p: any) => {
        tiers[p.membership_tier] = (tiers[p.membership_tier] || 0) + 1;
      });

      const todayRevenue = (bookingsToday.data || []).reduce(
        (sum: number, b: any) => sum + (parseFloat(b.total_price) || 0), 0
      );
      const monthlyBookingRevenue = (recentBookings.data || []).reduce(
        (sum: number, b: any) => sum + (parseFloat(b.total_price) || 0), 0
      );
      const monthlyMembershipRevenue = (membershipPayments.data || []).reduce(
        (sum: number, p: any) => sum + (parseFloat(p.amount) || 0), 0
      );

      return respond({
        today: {
          bookings_count: bookingsToday.data?.length || 0,
          revenue: todayRevenue,
        },
        last_30_days: {
          booking_revenue: monthlyBookingRevenue,
          membership_revenue: monthlyMembershipRevenue,
          total_revenue: monthlyBookingRevenue + monthlyMembershipRevenue,
          bookings_count: recentBookings.data?.length || 0,
        },
        membership_breakdown: tiers,
        total_customers: profiles.length,
        active_members: profiles.filter((p: any) => p.membership_tier !== "visitor").length,
      });
    }

    // ── Timetable / Bookings by date ──
    if (action === "get-timetable") {
      const date = params.date || new Date().toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("bookings")
        .select("*, bays(name, bay_number), profiles!bookings_user_id_fkey(first_name, last_name, email, phone, membership_tier)")
        .eq("booking_date", date)
        .in("status", ["confirmed", "completed", "pending"])
        .order("start_time");

      if (error) throw new Error(error.message);
      return respond({ date, bookings: data });
    }

    // ── Get single booking ──
    if (action === "get-booking") {
      if (!params.booking_id) return respond({ error: "booking_id required" }, 400);
      const { data, error } = await supabase
        .from("bookings")
        .select("*, bays(name, bay_number), profiles!bookings_user_id_fkey(first_name, last_name, email, phone, membership_tier, deposit_balance)")
        .eq("id", params.booking_id)
        .single();

      if (error) throw new Error(error.message);
      return respond({ booking: data });
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

      // Also get their bookings
      const { data: bookings } = await supabase
        .from("bookings")
        .select("id, booking_date, start_time, end_time, duration_hours, total_price, status, payment_method, bays(name)")
        .eq("user_id", profile.user_id)
        .order("booking_date", { ascending: false })
        .limit(20);

      // And deposit transactions
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
      const [bays, devices, blocks] = await Promise.all([
        supabase.from("bays").select("*").order("bay_number"),
        supabase.from("bay_devices").select("*"),
        supabase.from("bay_blocks").select("*").gte("block_date", new Date().toISOString().split("T")[0]),
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

      const tourId = params.tour_id || tours?.data?.[0]?.tour_id || tours?.[0]?.tour_id;

      if (!tourId && tours && tours.length > 0) {
        // Use first active tour
        const activeTour = tours[0];
        const { data: standings } = await supabase
          .from("sgt_tour_standings")
          .select("*")
          .eq("tour_id", activeTour.tour_id)
          .order("position");

        return respond({ tour: activeTour, standings });
      }

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

      // Stripe refund
      if (booking.stripe_payment_intent_id && (booking.payment_method === "stripe" || booking.payment_method === "card")) {
        const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil" });
        const refund = await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          reason: "requested_by_customer",
        });
        refundResult = { type: "stripe", refund_id: refund.id, amount: refund.amount / 100, status: refund.status };
        log(action, "Stripe refund processed", refundResult);
      }

      // Balance refund
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

      // Cancel the booking
      await supabase
        .from("bookings")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", params.booking_id);

      // Send notification if requested
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

    // ── Send notification / announcement ──
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

    // ── List available actions ──
    if (action === "list-actions") {
      return respond({
        read_actions: [
          "get-dashboard-stats",
          "get-timetable (date?)",
          "get-booking (booking_id)",
          "get-customers (search?, membership_tier?, limit?)",
          "get-customer (user_id | email)",
          "get-bay-status",
          "get-league-standings (tour_id?)",
          "get-membership-payments (user_id?, limit?)",
          "get-pos-transactions (limit?)",
          "get-gift-cards (limit?)",
          "get-announcements (limit?)",
          "get-bay-logs (bay_number?, event_level?, limit?)",
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
      });
    }

    return respond({ error: `Unknown action: ${action}. Use action 'list-actions' to see available commands.` }, 400);

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[OPENCLAW-API] Error:", msg);
    return respond({ error: msg }, 500);
  }
});
