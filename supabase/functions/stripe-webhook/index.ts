import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

const TIER_NAMES: Record<string, string> = {
  "weekday": "Weekday",
  "birdie": "Birdie",
  "eagle": "Eagle",
};

const TIER_WEEKLY_PRICES: Record<string, string> = {
  "weekday": "$15.00",
  "birdie": "$27.00",
  "eagle": "$35.00",
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};

// Dynamically build price to tier map from database
const getPriceToTierMap = async (supabaseAdmin: any): Promise<Record<string, string>> => {
  const { data: pricingConfig } = await supabaseAdmin
    .from("pricing_config")
    .select("tier, stripe_price_id")
    .eq("is_subscription", true);
  
  const map: Record<string, string> = {};
  if (pricingConfig) {
    for (const config of pricingConfig as Array<{ tier: string; stripe_price_id: string | null }>) {
      if (config.stripe_price_id) {
        map[config.stripe_price_id] = config.tier;
      }
    }
  }
  logStep("Loaded price to tier map", { map });
  return map;
};

// Remove user from SGT tour when downgraded
const removeFromSGT = async (supabaseAdmin: any, email: string) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, sgt_user_id")
      .eq("email", email)
      .maybeSingle();

    if (!profile?.sgt_user_id) {
      logStep("No SGT user ID found, skipping SGT removal", { email });
      return;
    }

    const sgtUserId = profile.sgt_user_id;
    logStep("Removing user from SGT", { email, sgtUserId });

    // Find the active tour
    const { data: activeTour } = await supabaseAdmin
      .from("sgt_tours")
      .select("tour_id")
      .eq("active", 1)
      .single();

    if (!activeTour) {
      logStep("No active tour found, skipping SGT removal");
      return;
    }

    // Remove from tour members
    const { error: tourMemberError } = await supabaseAdmin
      .from("sgt_tour_members")
      .delete()
      .eq("tour_id", activeTour.tour_id)
      .eq("user_id", sgtUserId);

    if (tourMemberError) {
      logStep("Error removing from tour members", { error: tourMemberError.message });
    } else {
      logStep("Removed from SGT tour members", { tourId: activeTour.tour_id, sgtUserId });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("Error during SGT removal", { email, error: errorMessage });
  }
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-07-30.basil" });
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

    // Load dynamic price to tier map
    const PRICE_TO_TIER = await getPriceToTierMap(supabaseAdmin);

    // ─── SUBSCRIPTION CREATED / UPDATED ───
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      
      logStep("Processing subscription", { subscriptionId: subscription.id, status: subscription.status });

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

      // past_due/unpaid are now handled immediately by invoice.payment_failed
      if (subscription.status === "past_due" || subscription.status === "unpaid") {
        logStep("Subscription is past_due/unpaid - handled by invoice.payment_failed", { email, status: subscription.status });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Only update tier if subscription is active
      if (subscription.status === "active") {
        const priceId = subscription.items.data[0]?.price?.id;
        const newTier = priceId ? PRICE_TO_TIER[priceId] : null;

        if (newTier) {
          logStep("Updating membership tier", { email, newTier });

          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, membership_tier, custom_billing")
            .eq("email", email)
            .maybeSingle();

          // Skip if custom billing
          if (profile?.custom_billing) {
            logStep("Customer has custom billing, skipping tier update", { email });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          const previousTier = profile?.membership_tier;
          const isNewMembership = previousTier === "visitor" || !previousTier;

          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: newTier })
            .eq("email", email);

          if (error) {
            logStep("Error updating profile", { error: error.message });
            throw error;
          }

          logStep("Membership tier updated successfully");

          // Send membership confirmation email for new memberships or upgrades
          if (resend && (isNewMembership || event.type === "customer.subscription.created")) {
            const firstName = profile?.first_name || customer.name?.split(" ")[0] || "there";
            const lastName = profile?.last_name || "";
            const tierName = TIER_NAMES[newTier] || newTier;
            const weeklyPrice = TIER_WEEKLY_PRICES[newTier] || "";

            const { data: emailTemplate } = await supabaseAdmin
              .from("email_templates")
              .select("*")
              .eq("template_key", "membership_activated")
              .eq("is_active", true)
              .single();

            const templateTags: Record<string, string> = {
              '{first_name}': firstName,
              '{last_name}': lastName,
              '{email}': email,
              '{tier_name}': tierName,
              '{weekly_price}': weeklyPrice,
            };

            let subject = emailTemplate?.subject || `Welcome to the ${tierName} Membership!`;
            let htmlContent: string;

            if (emailTemplate?.html_content) {
              htmlContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
              subject = replaceTemplateTags(subject, templateTags);
            } else {
              htmlContent = `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <div style="background-color: #1f4c25; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                    <h1 style="color: #fff5e4; margin: 0;">Welcome to ${tierName}!</h1>
                  </div>
                  <div style="background-color: #fff5e4; padding: 30px; border-radius: 0 0 8px 8px;">
                    <p>Hi ${firstName},</p>
                    <p>Congratulations! Your <strong>${tierName}</strong> membership is now active.</p>
                    
                    <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ec622d;">
                      <p style="margin: 5px 0;"><strong>Membership:</strong> ${tierName}</p>
                      <p style="margin: 5px 0;"><strong>Weekly Price:</strong> ${weeklyPrice}</p>
                    </div>
                    
                    <p>You now have access to discounted bay rates and exclusive member benefits including the Birdies League!</p>
                    
                    <p>Ready to play? Book your next session now!</p>
                    
                    <p>See you soon,<br><strong>The Birdies Team</strong></p>
                  </div>
                  <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                    <p>Birdies Bayside Golf Simulators</p>
                    <p>info@birdiesbayside.com.au</p>
                  </div>
                </body>
                </html>
              `;
            }

            try {
              await resend.emails.send({
                from: "Birdies Bayside <info@birdiesbayside.com.au>",
                to: [email],
                subject: subject,
                html: htmlContent,
              });
              logStep("Membership confirmation email sent", { email, tier: tierName });
            } catch (emailError) {
              logStep("Failed to send membership confirmation email", { error: emailError });
            }
          }
        } else {
          logStep("Unknown price ID, not updating tier", { priceId });
        }
      }
    }

    // ─── SUBSCRIPTION DELETED ───
    // This is the SINGLE place that handles downgrade + cancellation email.
    // Triggered by: voluntary cancellation, admin cancellation, OR immediate cancel from payment failure.
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

      // Check if customer has any other active subscriptions (e.g., plan switch)
      const activeSubscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 1,
      });

      if (activeSubscriptions.data.length > 0) {
        logStep("Customer has another active subscription, skipping tier reset", { 
          cancelledSubscription: subscription.id,
          activeSubscription: activeSubscriptions.data[0].id 
        });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (email) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, membership_tier, custom_billing")
          .eq("email", email)
          .maybeSingle();

        // Skip if custom billing
        if (profile?.custom_billing) {
          logStep("Customer has custom billing, skipping tier reset", { email });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Already visitor — nothing to do
        if (profile?.membership_tier === "visitor") {
          logStep("Already visitor, skipping", { email });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const firstName = profile?.first_name || customer.name?.split(" ")[0] || "there";
        const lastName = profile?.last_name || "";
        const previousTier = profile?.membership_tier ? TIER_NAMES[profile.membership_tier] || profile.membership_tier : "Member";

        logStep("Resetting membership tier to visitor", { email, previousTier });

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ membership_tier: "visitor" })
          .eq("email", email);

        if (error) {
          logStep("Error resetting profile", { error: error.message });
          throw error;
        }

        logStep("Membership tier reset to visitor");

        // Remove from SGT tour
        await removeFromSGT(supabaseAdmin, email);

        // Send ONE cancellation email
        if (resend) {
          const { data: emailTemplate } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("template_key", "membership_cancelled")
            .eq("is_active", true)
            .single();

          const templateTags: Record<string, string> = {
            '{first_name}': firstName,
            '{last_name}': lastName,
            '{email}': email,
            '{tier_name}': previousTier,
          };

          let subject = emailTemplate?.subject || "Your Birdies Membership Has Been Cancelled";
          let htmlContent: string;

          if (emailTemplate?.html_content) {
            htmlContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
            subject = replaceTemplateTags(subject, templateTags);
          } else {
            htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background-color: #1f4c25; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                  <h1 style="color: #fff5e4; margin: 0;">Membership Cancelled</h1>
                </div>
                <div style="background-color: #fff5e4; padding: 30px; border-radius: 0 0 8px 8px;">
                  <p>Hi ${firstName},</p>
                  <p>Your <strong>${previousTier}</strong> membership has been cancelled.</p>
                  
                  <p>Your account has been reverted to Visitor status. You can still book sessions at our standard visitor rates.</p>
                  
                  <p>If you'd like to rejoin, simply re-register for a membership through your account when you have a valid payment method.</p>
                  
                  <p>We hope to see you back soon!</p>
                  
                  <p>Best regards,<br><strong>The Birdies Team</strong></p>
                </div>
                <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                  <p>Birdies Bayside Golf Simulators</p>
                  <p>info@birdiesbayside.com.au</p>
                </div>
              </body>
              </html>
            `;
          }

          try {
            await resend.emails.send({
              from: "Birdies Bayside <info@birdiesbayside.com.au>",
              to: [email],
              subject: subject,
              html: htmlContent,
            });
            logStep("Membership cancellation email sent", { email });
          } catch (emailError) {
            logStep("Failed to send membership cancellation email", { error: emailError });
          }
        }
      }
    }

    // ─── CHECKOUT SESSION COMPLETED (booking payments) ───
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      const paymentIntentId = session.payment_intent as string;

      logStep("Checkout session completed", { sessionId: session.id, bookingId, paymentIntentId });

      if (bookingId) {
        const { error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({
            status: "confirmed",
            payment_method: "card",
            stripe_payment_intent_id: paymentIntentId,
          })
          .eq("id", bookingId);

        if (updateError) {
          logStep("Error updating booking", { error: updateError.message });
        } else {
          logStep("Booking confirmed successfully", { bookingId });

          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL");
            const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            
            await fetch(`${supabaseUrl}/functions/v1/send-booking-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({
                booking_id: bookingId,
                notification_type: "confirmation",
              }),
            });
            logStep("Booking notification sent");
          } catch (notificationError) {
            logStep("Failed to send booking notification", { error: notificationError });
          }
        }
      }
    }

    // ─── INVOICE PAYMENT FAILED ───
    // IMMEDIATE CANCELLATION: Cancel the subscription right away.
    // The customer.subscription.deleted event will handle downgrade + email.
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      
      // Support both old and new Stripe API structure for subscription ID
      let subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
        subscriptionId = (invoice as any).parent.subscription_details.subscription;
      }

      logStep("Payment failed", { invoiceId: invoice.id, subscriptionId });

      // Only process subscription invoices
      if (subscriptionId) {
        // Skip if subscription is paused (membership on hold)
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.pause_collection) {
            logStep("Subscription is paused (membership on hold), skipping", { 
              subscriptionId, 
              pauseBehavior: subscription.pause_collection.behavior 
            });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (subError) {
          logStep("Could not check subscription pause status, proceeding", { error: subError });
        }

        const customer = await stripe.customers.retrieve(customerId);
        if (customer.deleted) {
          logStep("Customer deleted, skipping");
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const email = customer.email;
        if (email) {
          // Check custom billing
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("custom_billing")
            .eq("email", email)
            .maybeSingle();

          if (profile?.custom_billing) {
            logStep("Customer has custom billing, skipping cancellation", { email });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }

        // IMMEDIATELY cancel the subscription — this triggers customer.subscription.deleted
        // which handles the downgrade to visitor, SGT removal, and sends ONE email
        try {
          await stripe.subscriptions.cancel(subscriptionId);
          logStep("Subscription immediately cancelled due to payment failure", { subscriptionId });
        } catch (cancelError) {
          logStep("Failed to cancel subscription", { error: cancelError });
        }

        // Void the failed invoice to clean up
        try {
          await stripe.invoices.voidInvoice(invoice.id);
          logStep("Failed invoice voided", { invoiceId: invoice.id });
        } catch (voidError) {
          logStep("Could not void invoice (may already be handled)", { error: voidError });
        }
      }
    }

    // ─── INVOICE PAYMENT SUCCEEDED ───
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      
      let subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
        subscriptionId = (invoice as any).parent.subscription_details.subscription;
      }

      logStep("Invoice payment succeeded", { 
        invoiceId: invoice.id, 
        subscriptionId, 
        customerId,
        billingReason: invoice.billing_reason,
        amountPaid: invoice.amount_paid,
      });

      // Only process subscription invoices
      if (!subscriptionId) {
        logStep("No subscription ID, skipping (not a subscription invoice)");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (invoice.billing_reason === "manual") {
        logStep("Manual billing reason, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let customer;
      try {
        customer = await stripe.customers.retrieve(customerId);
      } catch (customerError) {
        logStep("Error retrieving customer", { error: customerError });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (customer.deleted) {
        logStep("Customer deleted, skipping");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (!email) {
        logStep("No email found, cannot record payment");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, membership_tier")
        .eq("email", email)
        .maybeSingle();

      if (profileError || !profile?.user_id) {
        logStep("No profile found", { email });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Determine tier from subscription price
      let tier = profile.membership_tier || "unknown";
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        if (priceId && PRICE_TO_TIER[priceId]) {
          tier = PRICE_TO_TIER[priceId];
        }
      } catch (subError) {
        logStep("Error retrieving subscription, using profile tier", { error: subError });
      }

      const amount = (invoice.amount_paid || 0) / 100;

      // Skip $0 payments
      if (amount <= 0) {
        logStep("Skipping $0 payment", { invoiceId: invoice.id });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Record membership payment
      const { error: insertError } = await supabaseAdmin
        .from("membership_payments")
        .upsert({
          user_id: profile.user_id,
          stripe_invoice_id: invoice.id,
          stripe_customer_id: customerId,
          amount: amount,
          tier: tier,
          period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
          period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
          paid_at: new Date().toISOString(),
        }, {
          onConflict: 'stripe_invoice_id'
        });

      if (insertError) {
        logStep("Error recording membership payment", { error: insertError.message });
      } else {
        logStep("Membership payment recorded", { email, tier, amount, invoiceId: invoice.id });
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
