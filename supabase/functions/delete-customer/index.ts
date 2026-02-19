import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DeleteCustomerRequest {
  user_id: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[delete-customer] ${step}${detailsStr}`);
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id }: DeleteCustomerRequest = await req.json();

    if (!user_id) {
      throw new Error("user_id is required");
    }

    logStep("Deleting user", { user_id });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get the user's email for Stripe lookup
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email")
      .eq("user_id", user_id)
      .maybeSingle();

    const userEmail = profile?.email;
    logStep("Found profile", { email: userEmail });

    // Step 1: Cancel all Stripe subscriptions
    if (stripeKey && userEmail) {
      try {
        const stripe = new Stripe(stripeKey, { apiVersion: "2025-07-30.basil" });
        const customers = await stripe.customers.list({ email: userEmail, limit: 5 });

        for (const customer of customers.data) {
          logStep("Processing Stripe customer", { customerId: customer.id });

          // Cancel all active subscriptions
          const subscriptions = await stripe.subscriptions.list({
            customer: customer.id,
            status: "active",
          });

          for (const sub of subscriptions.data) {
            await stripe.subscriptions.cancel(sub.id);
            logStep("Cancelled subscription", { subscriptionId: sub.id });
          }

          // Also cancel trialing/past_due
          const otherSubs = await stripe.subscriptions.list({
            customer: customer.id,
            status: "past_due",
          });
          for (const sub of otherSubs.data) {
            await stripe.subscriptions.cancel(sub.id);
            logStep("Cancelled past_due subscription", { subscriptionId: sub.id });
          }

          // Delete the Stripe customer entirely
          await stripe.customers.del(customer.id);
          logStep("Deleted Stripe customer", { customerId: customer.id });
        }
      } catch (stripeError: any) {
        logStep("Stripe cleanup error (continuing)", { error: stripeError.message });
      }
    }

    // Step 2: Clean up database records
    const cleanupTables = [
      { table: "bookings", column: "user_id" },
      { table: "deposit_transactions", column: "user_id" },
      { table: "membership_payments", column: "user_id" },
      { table: "clubhouse_posts", column: "user_id" },
      { table: "clubhouse_comments", column: "user_id" },
      { table: "clubhouse_upvotes", column: "user_id" },
      { table: "announcement_reads", column: "user_id" },
      { table: "push_tokens", column: "user_id" },
      { table: "google_review_rewards", column: "user_id" },
    ];

    for (const { table, column } of cleanupTables) {
      const { error } = await supabaseAdmin.from(table).delete().eq(column, user_id);
      if (error) {
        logStep(`Cleanup warning for ${table}`, { error: error.message });
      } else {
        logStep(`Cleaned up ${table}`);
      }
    }

    // Step 3: Delete the auth user (cascades to profiles)
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (error) {
      console.error(`[delete-customer] Error deleting user:`, error);
      throw error;
    }

    logStep("Successfully deleted user and all associated data", { user_id });

    return new Response(
      JSON.stringify({ success: true }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("[delete-customer] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
