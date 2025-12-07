import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

// Map Stripe price IDs to membership tiers
const PRICE_TO_TIER: Record<string, string> = {
  "price_1RXVg3AzMTsMp66Qx0LdLDIQ": "par",
  "price_1RXVgjAzMTsMp66Qp9fXfMy0": "birdie",
  "price_1RXVh5AzMTsMp66Q3J5swNbH": "eagle",
  "price_1RXVhQAzMTsMp66QpAGoLHYn": "albatross",
};

const TIER_NAMES: Record<string, string> = {
  "par": "Par",
  "birdie": "Birdie",
  "eagle": "Eagle",
  "albatross": "Albatross",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!stripeKey || !webhookSecret) {
      throw new Error("Missing Stripe configuration");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const resend = resendApiKey ? new Resend(resendApiKey) : null;
    
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      throw new Error("No Stripe signature found");
    }

    const body = await req.text();
    let event: Stripe.Event;

    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logStep("Webhook signature verification failed", { error: errorMessage });
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Event verified", { type: event.type });

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      
      logStep("Processing subscription", { subscriptionId: subscription.id, status: subscription.status });

      // Get customer email from Stripe
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        logStep("Customer deleted, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (!email) {
        logStep("No email found for customer");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logStep("Found customer email", { email });

      // Only update tier if subscription is active
      if (subscription.status === "active") {
        const priceId = subscription.items.data[0]?.price?.id;
        const newTier = priceId ? PRICE_TO_TIER[priceId] : null;

        if (newTier) {
          logStep("Updating membership tier", { email, newTier });

          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: newTier })
            .eq("email", email);

          if (error) {
            logStep("Error updating profile", { error: error.message });
            throw error;
          }

          logStep("Membership tier updated successfully");
        } else {
          logStep("Unknown price ID, not updating tier", { priceId });
        }
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      logStep("Subscription cancelled", { subscriptionId: subscription.id });

      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        logStep("Customer deleted, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (email) {
        logStep("Resetting membership tier to visitor", { email });

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ membership_tier: "visitor" })
          .eq("email", email);

        if (error) {
          logStep("Error resetting profile", { error: error.message });
          throw error;
        }

        logStep("Membership tier reset to visitor");
      }
    }

    // Handle failed payment for subscriptions
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const subscriptionId = invoice.subscription as string;

      logStep("Payment failed", { invoiceId: invoice.id, subscriptionId });

      // Only process if this is a subscription invoice
      if (subscriptionId) {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          logStep("Customer deleted, skipping");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const email = customer.email;
        const customerName = customer.name || "Valued Customer";

        if (email) {
          // Get the current profile to find their tier
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("first_name, membership_tier")
            .eq("email", email)
            .maybeSingle();

          const firstName = profile?.first_name || customerName.split(" ")[0];
          const previousTier = profile?.membership_tier ? TIER_NAMES[profile.membership_tier] || profile.membership_tier : "Member";

          logStep("Resetting membership to visitor due to failed payment", { email, previousTier });

          // Reset to visitor tier
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: "visitor" })
            .eq("email", email);

          if (error) {
            logStep("Error resetting profile", { error: error.message });
          }

          // Send payment failed notification email
          if (resend) {
            try {
              await resend.emails.send({
                from: "Birdies <info@birdiesbayside.com.au>",
                to: [email],
                subject: "Payment Failed - Membership Update",
                html: `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1f4c25;">Hi ${firstName},</h2>
                    
                    <p>We were unable to process your weekly membership payment.</p>
                    
                    <p>Unfortunately, this means your <strong>${previousTier}</strong> membership has been reverted to <strong>Visitor</strong> status.</p>
                    
                    <p>To continue enjoying member rates, please update your payment method and resubscribe to your preferred membership tier.</p>
                    
                    <p>If you believe this is an error or need assistance, please contact us at info@birdiesbayside.com.au</p>
                    
                    <p>Thank you for being a valued customer.</p>
                    
                    <p>Best regards,<br>The Birdies Team</p>
                  </div>
                `,
              });
              logStep("Payment failed notification email sent", { email });
            } catch (emailError) {
              logStep("Failed to send payment failed email", { error: emailError });
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
