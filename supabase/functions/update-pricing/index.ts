import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[UPDATE-PRICING] ${step}${detailsStr}`);
};

interface PricingUpdate {
  tier: string;
  hourly_rate: number;
  weekly_subscription_price?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    
    // Check admin role
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user?.id)
      .eq("role", "admin")
      .maybeSingle();
    
    if (!roleData) throw new Error("Admin access required");
    logStep("Admin authenticated");

    const { updates, migrate_subscribers } = await req.json() as { 
      updates: PricingUpdate[]; 
      migrate_subscribers: boolean;
    };

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const results: any[] = [];

    for (const update of updates) {
      logStep(`Processing tier: ${update.tier}`, update);

      // Get current pricing config
      const { data: currentConfig, error: configError } = await supabaseClient
        .from("pricing_config")
        .select("*")
        .eq("tier", update.tier)
        .single();

      if (configError) {
        logStep(`Error fetching config for ${update.tier}`, configError);
        results.push({ tier: update.tier, success: false, error: configError.message });
        continue;
      }

      // Update hourly rate in database
      const dbUpdate: any = { hourly_rate: update.hourly_rate };

      // Handle subscription tiers with Stripe
      if (currentConfig.is_subscription && update.weekly_subscription_price !== undefined) {
        dbUpdate.weekly_subscription_price = update.weekly_subscription_price;

        // Check if price changed
        const priceChanged = update.weekly_subscription_price !== Number(currentConfig.weekly_subscription_price);

        if (priceChanged && currentConfig.stripe_product_id) {
          logStep(`Price changed for ${update.tier}, creating new Stripe price`);

          // Create new price in Stripe
          const newPrice = await stripe.prices.create({
            product: currentConfig.stripe_product_id,
            unit_amount: Math.round(update.weekly_subscription_price * 100),
            currency: "aud",
            recurring: { interval: "week" },
          });

          logStep(`New price created: ${newPrice.id}`);
          dbUpdate.stripe_price_id = newPrice.id;

          // Archive old price
          if (currentConfig.stripe_price_id) {
            await stripe.prices.update(currentConfig.stripe_price_id, { active: false });
            logStep(`Old price archived: ${currentConfig.stripe_price_id}`);
          }

          // Migrate existing subscribers if requested
          if (migrate_subscribers) {
            logStep(`Migrating subscribers for ${update.tier}`);

            // Find all active subscriptions with the old price
            let hasMore = true;
            let startingAfter: string | undefined;
            let migratedCount = 0;

            while (hasMore) {
              const subscriptions = await stripe.subscriptions.list({
                price: currentConfig.stripe_price_id,
                status: "active",
                limit: 100,
                ...(startingAfter ? { starting_after: startingAfter } : {}),
              });

              for (const subscription of subscriptions.data) {
                try {
                  // Get the subscription item with the old price
                  const itemToUpdate = subscription.items.data.find(
                    (item: any) => item.price.id === currentConfig.stripe_price_id
                  );

                  if (itemToUpdate) {
                    await stripe.subscriptions.update(subscription.id, {
                      items: [{
                        id: itemToUpdate.id,
                        price: newPrice.id,
                      }],
                      proration_behavior: "none", // No proration - apply at next billing
                    });
                    migratedCount++;
                    logStep(`Migrated subscription: ${subscription.id}`);
                  }
                } catch (subError: any) {
                  logStep(`Failed to migrate subscription ${subscription.id}`, subError.message);
                }
              }

              hasMore = subscriptions.has_more;
              if (subscriptions.data.length > 0) {
                startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
              }
            }

            logStep(`Migration complete for ${update.tier}`, { migratedCount });
          }
        }
      }

      // Update database
      const { error: updateError } = await supabaseClient
        .from("pricing_config")
        .update(dbUpdate)
        .eq("tier", update.tier);

      if (updateError) {
        results.push({ tier: update.tier, success: false, error: updateError.message });
      } else {
        results.push({ tier: update.tier, success: true });
      }
    }

    logStep("All updates complete", { results });

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});