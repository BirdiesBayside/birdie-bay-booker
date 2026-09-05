import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RedeemGiftCardRequest {
  email: string;
  user_id: string;
  token?: string; // Optional - if provided, only redeem that specific card
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, user_id, token }: RedeemGiftCardRequest = await req.json();

    if (!email || !user_id) {
      throw new Error("email and user_id are required");
    }

    console.log(`[redeem-gift-card] Checking for gift cards for email: ${email}`);

    // Create admin Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find pending gift cards for this email
    let query = supabase
      .from("gift_cards")
      .select("*")
      .eq("recipient_email", email.toLowerCase().trim())
      .in("status", ["pending", "sent"]);

    if (token) {
      query = query.eq("token", token);
    }

    const { data: giftCards, error: fetchError } = await query;

    if (fetchError) {
      console.error("[redeem-gift-card] Error fetching gift cards:", fetchError);
      throw fetchError;
    }

    if (!giftCards || giftCards.length === 0) {
      console.log("[redeem-gift-card] No pending gift cards found");
      return new Response(
        JSON.stringify({ success: true, redeemed: 0, totalAmount: 0 }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Hour packs (credit_hours > 0) grant hour credits only — their dollar
    // amount is the purchase price, not spendable balance.
    const totalAmount = giftCards.reduce((sum, gc) => sum + (Number(gc.credit_hours || 0) > 0 ? 0 : Number(gc.amount)), 0);
    const totalHours = giftCards.reduce((sum, gc) => sum + Number(gc.credit_hours || 0), 0);

    console.log(`[redeem-gift-card] Found ${giftCards.length} gift cards totaling $${totalAmount} and ${totalHours} hours`);

    // Get current user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("deposit_balance, hour_credit_balance")
      .eq("user_id", user_id)
      .maybeSingle();

    if (profileError) {
      console.error("[redeem-gift-card] Error fetching profile:", profileError);
      throw profileError;
    }

    const currentBalance = profile?.deposit_balance || 0;
    const currentHourBalance = profile?.hour_credit_balance || 0;
    const newBalance = currentBalance + totalAmount;
    const newHourBalance = currentHourBalance + totalHours;

    // Update user balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ deposit_balance: newBalance, hour_credit_balance: newHourBalance })
      .eq("user_id", user_id);

    if (updateError) {
      console.error("[redeem-gift-card] Error updating balance:", updateError);
      throw updateError;
    }

    // Mark gift cards as redeemed
    const giftCardIds = giftCards.map(gc => gc.id);
    const { error: redeemError } = await supabase
      .from("gift_cards")
      .update({
        status: "redeemed",
        redeemed_at: new Date().toISOString(),
        redeemed_by_user_id: user_id,
      })
      .in("id", giftCardIds);

    if (redeemError) {
      console.error("[redeem-gift-card] Error marking as redeemed:", redeemError);
      throw redeemError;
    }

    // Log dollar transactions
    for (const gc of giftCards) {
      if (gc.amount > 0) {
        await supabase.from("deposit_transactions").insert({
          user_id,
          amount: gc.amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          transaction_type: "gift_card",
          description: "Gift card redemption",
          related_gift_card_id: gc.id,
        });
      }
      if (gc.credit_hours > 0) {
        await supabase.from("hour_credit_transactions").insert({
          user_id,
          amount: gc.credit_hours,
          balance_before: currentHourBalance,
          balance_after: newHourBalance,
          transaction_type: "gift_card",
          description: "Gift card redemption - hour credits",
          related_gift_card_id: gc.id,
        });
      }
    }

    console.log(`[redeem-gift-card] Successfully redeemed ${giftCards.length} gift cards for $${totalAmount} and ${totalHours} hours`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        redeemed: giftCards.length, 
        totalAmount,
        totalHours,
        newBalance,
        newHourBalance,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("[redeem-gift-card] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
