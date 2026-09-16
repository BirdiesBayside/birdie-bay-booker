import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMESLOTS = ["8-11am", "11am-2pm", "2-5pm"];
const ENTRY_PRICE = 99;

interface Body {
  name?: string;
  email?: string;
  preferred_timeslot?: string;
  pay_now?: boolean;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;

    const name = (body.name ?? "").trim();
    const email = (body.email ?? "").trim().toLowerCase();
    const timeslot = (body.preferred_timeslot ?? "").trim();
    const payNow = body.pay_now === true;

    if (name.length < 2 || name.length > 100) throw new Error("Please enter your full name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
      throw new Error("Enter a valid email address");
    }
    if (!TIMESLOTS.includes(timeslot)) throw new Error("Select a preferred timeslot");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find an existing registration for this email (stage 1), otherwise create one.
    const { data: existing } = await supabase
      .from("sim_cup_registrations")
      .select("id, payment_status, assigned_timeslot")
      .ilike("email", email)
      .maybeSingle();

    let registrationId: string;

    if (existing) {
      registrationId = existing.id;
      const update: Record<string, unknown> = {
        name,
        preferred_timeslot: timeslot,
      };
      // Only auto-assign if an admin hasn't already grouped them.
      if (!existing.assigned_timeslot) update.assigned_timeslot = timeslot;
      if (existing.payment_status !== "paid") {
        update.payment_method = payNow ? "card" : "pay_at_venue";
      }
      const { error } = await supabase
        .from("sim_cup_registrations")
        .update(update)
        .eq("id", registrationId);
      if (error) throw new Error(error.message);
    } else {
      const { data: inserted, error } = await supabase
        .from("sim_cup_registrations")
        .insert({
          name,
          email,
          preferred_timeslot: timeslot,
          assigned_timeslot: timeslot,
          payment_method: payNow ? "card" : "pay_at_venue",
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(error?.message || "Could not save registration");
      registrationId = inserted.id;
    }

    if (!payNow) {
      return new Response(JSON.stringify({ registration_id: registrationId, url: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-07-30.basil",
    });

    const origin = req.headers.get("origin") || "https://birdiesbayside.com.au";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: "The Sim Cup — Entry",
              description: "Bay time, food, first drink and team t-shirt included.",
            },
            unit_amount: ENTRY_PRICE * 100,
          },
          quantity: 1,
        },
      ],
      metadata: { purpose: "sim_cup", sim_cup_registration_id: registrationId },
      payment_intent_data: {
        metadata: { purpose: "sim_cup", sim_cup_registration_id: registrationId },
      },
      success_url: `${origin}/sim-cup-confirm?success=1`,
      cancel_url: `${origin}/sim-cup-confirm?cancelled=1`,
    });

    await supabase
      .from("sim_cup_registrations")
      .update({ stripe_session_id: session.id })
      .eq("id", registrationId);

    return new Response(JSON.stringify({ registration_id: registrationId, url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sim-cup-confirm] Error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
