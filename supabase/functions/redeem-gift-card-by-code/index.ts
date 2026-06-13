import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Authorization required");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await supabase.auth.getUser(token);
    const user = userData?.user;
    if (!user) throw new Error("Not authenticated");

    const { code } = await req.json();
    if (!code || typeof code !== "string") throw new Error("Code required");

    const normalized = code.toUpperCase().trim();

    const { data: card, error: fetchErr } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("redemption_code", normalized)
      .maybeSingle();

    if (fetchErr) throw fetchErr;
    if (!card) throw new Error("Invalid code");
    if (card.status === "redeemed") throw new Error("This gift card has already been redeemed");
    if (card.status === "cancelled") throw new Error("This gift card has been cancelled");
    if (card.status === "pending_payment") throw new Error("Payment not yet confirmed");

    // Credit balance
    const { data: profile } = await supabase
      .from("profiles")
      .select("deposit_balance")
      .eq("user_id", user.id)
      .single();

    const before = Number(profile?.deposit_balance ?? 0);
    const after = before + Number(card.amount);

    await supabase.from("profiles").update({ deposit_balance: after }).eq("user_id", user.id);

    await supabase
      .from("gift_cards")
      .update({
        status: "redeemed",
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: user.id,
      })
      .eq("id", card.id);

    await supabase.from("deposit_transactions").insert({
      user_id: user.id,
      amount: Number(card.amount),
      balance_before: before,
      balance_after: after,
      transaction_type: "gift_card",
      description: `Gift card redeemed via code (from ${card.sender_name || "anonymous"})`,
      related_gift_card_id: card.id,
    });

    return new Response(
      JSON.stringify({ success: true, amount: Number(card.amount), newBalance: after }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
