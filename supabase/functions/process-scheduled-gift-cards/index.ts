import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function brisbaneToday(): string {
  const now = new Date();
  const bris = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return bris.toISOString().slice(0, 10);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = brisbaneToday();
  console.log(`[scheduled-gift-cards] Processing for Brisbane date: ${today}`);

  const { data: due, error } = await supabase
    .from("gift_cards")
    .select("id, recipient_email, amount")
    .eq("status", "scheduled")
    .lte("scheduled_for", today);

  if (error) {
    console.error("[scheduled-gift-cards] Query error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.log(`[scheduled-gift-cards] ${due?.length || 0} gift cards due`);
  const results: any[] = [];

  for (const gc of due || []) {
    try {
      const { error: sendErr } = await supabase.functions.invoke("issue-gift-card", {
        body: {
          gift_card_id: gc.id,
          recipient_email: gc.recipient_email,
          amount: gc.amount,
        },
      });
      if (sendErr) {
        console.error(`[scheduled-gift-cards] Send failed for ${gc.id}:`, sendErr);
        results.push({ id: gc.id, error: sendErr.message });
        continue;
      }
      await supabase
        .from("gift_cards")
        .update({ status: "pending", sent_at: new Date().toISOString() })
        .eq("id", gc.id);
      results.push({ id: gc.id, sent: true });
    } catch (e: any) {
      console.error(`[scheduled-gift-cards] Error for ${gc.id}:`, e);
      results.push({ id: gc.id, error: e.message });
    }
  }

  return new Response(
    JSON.stringify({ success: true, date: today, processed: results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
