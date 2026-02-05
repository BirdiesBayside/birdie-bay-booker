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

    // Load dynamic price to tier map
    const PRICE_TO_TIER = await getPriceToTierMap(supabaseAdmin);

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

      // Handle past_due or unpaid subscriptions - revert to visitor
      if (subscription.status === "past_due" || subscription.status === "unpaid") {
        logStep("Subscription is past_due/unpaid, checking if should revert", { email, status: subscription.status });
        
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, membership_tier, custom_billing")
          .eq("email", email)
          .maybeSingle();

        // Skip if custom billing enabled
        if (profile?.custom_billing) {
          logStep("Customer has custom billing enabled, skipping tier reset", { email });
        } else if (profile?.membership_tier && profile.membership_tier !== "visitor") {
          const previousTier = TIER_NAMES[profile.membership_tier] || profile.membership_tier;
          
          logStep("Resetting membership to visitor due to past_due status", { email, previousTier });
          
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: "visitor" })
            .eq("email", email);

          if (error) {
            logStep("Error resetting profile", { error: error.message });
          } else {
            logStep("Membership tier reset to visitor");

            // Cancel the subscription in Stripe to prevent duplicate subscriptions
            try {
              await stripe.subscriptions.cancel(subscription.id);
              logStep("Subscription cancelled in Stripe due to past_due status", { subscriptionId: subscription.id });

              // Remove all payment methods from the customer to force them to re-add a card
              // This provides a cleaner UX since the declined card won't work again
              const paymentMethods = await stripe.paymentMethods.list({
                customer: customerId,
                type: "card",
              });
              
              for (const pm of paymentMethods.data) {
                try {
                  await stripe.paymentMethods.detach(pm.id);
                  logStep("Detached failed payment method", { paymentMethodId: pm.id });
                } catch (detachError) {
                  logStep("Failed to detach payment method", { paymentMethodId: pm.id, error: detachError });
                }
              }
              logStep("Removed payment methods from customer after subscription cancellation");
            } catch (cancelError) {
              logStep("Failed to cancel subscription in Stripe", { error: cancelError, subscriptionId: subscription.id });
            }
            
            // Send payment failed notification
            if (resend) {
              const firstName = profile.first_name || customer.name?.split(" ")[0] || "there";
              
              const { data: emailTemplate } = await supabaseAdmin
                .from("email_templates")
                .select("*")
                .eq("template_key", "payment_failed")
                .eq("is_active", true)
                .single();

              if (emailTemplate) {
                const templateTags: Record<string, string> = {
                  '{first_name}': firstName,
                  '{last_name}': profile.last_name || '',
                  '{email}': email,
                  '{tier_name}': previousTier,
                };

                let subject = emailTemplate.subject || "Payment Failed - Membership Update";
                let htmlContent = emailTemplate.html_content || "";
                
                if (htmlContent) {
                  htmlContent = replaceTemplateTags(htmlContent, templateTags);
                  subject = replaceTemplateTags(subject, templateTags);

                  try {
                    await resend.emails.send({
                      from: "Birdies Bayside <info@birdiesbayside.com.au>",
                      to: [email],
                      subject: subject,
                      html: htmlContent,
                    });
                    logStep("Payment failed email sent", { email });
                  } catch (emailError) {
                    logStep("Failed to send payment failed email", { error: emailError });
                  }
                }
              }
            }
          }
        }
        
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

          // Get previous tier to check if this is a new subscription
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, membership_tier, custom_billing")
            .eq("email", email)
            .maybeSingle();

          // Skip tier update if customer has custom billing enabled
          if (profile?.custom_billing) {
            logStep("Customer has custom billing enabled, skipping tier update", { email });
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

            // Fetch custom template
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

      // Check if customer has any other active subscriptions (e.g., they switched plans)
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
        // Get profile to find previous tier and check custom billing
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("first_name, last_name, membership_tier, custom_billing")
          .eq("email", email)
          .maybeSingle();

        // Skip tier reset if customer has custom billing enabled
        if (profile?.custom_billing) {
          logStep("Customer has custom billing enabled, skipping tier reset", { email });
          return new Response(JSON.stringify({ received: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const firstName = profile?.first_name || customer.name?.split(" ")[0] || "there";
        const lastName = profile?.last_name || "";
        const previousTier = profile?.membership_tier ? TIER_NAMES[profile.membership_tier] || profile.membership_tier : "Member";

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

        // Send membership cancellation email
        if (resend) {
          // Fetch custom template
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
                  
                  <p>If you'd like to rejoin and enjoy member benefits again, you can resubscribe at any time through your account.</p>
                  
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

    // Handle checkout session completed (for booking payments)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const bookingId = session.metadata?.booking_id;
      const paymentIntentId = session.payment_intent as string;

      logStep("Checkout session completed", { sessionId: session.id, bookingId, paymentIntentId });

      if (bookingId) {
        // Update booking to confirmed
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

          // Send booking confirmation notification
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
          // Get the current profile to find their tier and check custom billing
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, membership_tier, custom_billing")
            .eq("email", email)
            .maybeSingle();

          // Skip tier reset if customer has custom billing enabled
          if (profile?.custom_billing) {
            logStep("Customer has custom billing enabled, skipping tier reset for failed payment", { email });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

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

          // Cancel the subscription in Stripe to prevent duplicate subscriptions
          // When user updates their card and re-subscribes, they'll get a fresh subscription
          try {
            await stripe.subscriptions.cancel(subscriptionId);
            logStep("Subscription cancelled in Stripe due to failed payment", { subscriptionId });
          } catch (cancelError) {
            logStep("Failed to cancel subscription in Stripe", { error: cancelError, subscriptionId });
          }

          // Send payment failed notification email using customizable template
          if (resend) {
            // Fetch custom template
            const { data: emailTemplate } = await supabaseAdmin
              .from("email_templates")
              .select("*")
              .eq("template_key", "payment_failed")
              .eq("is_active", true)
              .single();

            // If template is disabled, skip sending
            if (!emailTemplate) {
              logStep("Payment failed template disabled or not found, skipping email");
            } else {
              const templateTags: Record<string, string> = {
                '{first_name}': firstName,
                '{last_name}': profile?.last_name || '',
                '{email}': email,
                '{tier_name}': previousTier,
              };

              let subject = emailTemplate?.subject || "Payment Failed - Membership Update";
              let htmlContent: string;

              if (emailTemplate?.html_content) {
                htmlContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
                subject = replaceTemplateTags(subject, templateTags);
              } else {
                htmlContent = `
                  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1f4c25;">Hi ${firstName},</h2>
                    
                    <p>We were unable to process your weekly membership payment.</p>
                    
                    <p>Unfortunately, this means your <strong>${previousTier}</strong> membership has been reverted to <strong>Visitor</strong> status.</p>
                    
                    <p>To continue enjoying member rates, please update your payment method and resubscribe to your preferred membership tier.</p>
                    
                    <p>If you believe this is an error or need assistance, please contact us at info@birdiesbayside.com.au</p>
                    
                    <p>Thank you for being a valued customer.</p>
                    
                    <p>Best regards,<br>The Birdies Team</p>
                  </div>
                `;
              }

              try {
                await resend.emails.send({
                  from: "Birdies Bayside <info@birdiesbayside.com.au>",
                  to: [email],
                  subject: subject,
                  html: htmlContent,
                });
                logStep("Payment failed notification email sent", { email });
              } catch (emailError) {
                logStep("Failed to send payment failed email", { error: emailError });
              }
            }
          }
        }
      }
    }

    // Handle successful subscription payment - record for revenue tracking
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      
      // Support both old and new Stripe API structure for subscription ID
      // Old: invoice.subscription (string)
      // New (2025-07-30.basil): invoice.parent.subscription_details.subscription (string)
      let subscriptionId = invoice.subscription as string | null;
      
      // Check new API structure if old one is null
      if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
        subscriptionId = (invoice as any).parent.subscription_details.subscription;
      }

      logStep("Invoice payment succeeded", { 
        invoiceId: invoice.id, 
        subscriptionId, 
        customerId,
        billingReason: invoice.billing_reason,
        amountPaid: invoice.amount_paid,
        hasParentSubscription: !!(invoice as any).parent?.subscription_details?.subscription
      });

      // Only process if this is a subscription invoice (not one-time payments)
      if (!subscriptionId) {
        logStep("No subscription ID, skipping payment recording (not a subscription invoice)");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (invoice.billing_reason === "manual") {
        logStep("Manual billing reason, skipping payment recording");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logStep("Processing subscription payment recording");

      let customer;
      try {
        customer = await stripe.customers.retrieve(customerId);
        logStep("Customer retrieved", { customerId, deleted: customer.deleted });
      } catch (customerError) {
        logStep("Error retrieving customer", { error: customerError });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (customer.deleted) {
        logStep("Customer deleted, skipping payment recording");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const email = customer.email;
      if (!email) {
        logStep("No email found for customer, cannot record payment");
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logStep("Looking up profile for email", { email });

      // Get user profile
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("user_id, membership_tier")
        .eq("email", email)
        .maybeSingle();

      if (profileError) {
        logStep("Error fetching profile", { error: profileError.message });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!profile?.user_id) {
        logStep("No profile found for email, cannot record payment", { email });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      logStep("Profile found", { userId: profile.user_id, membershipTier: profile.membership_tier });

      // Determine tier from subscription price
      let tier = profile.membership_tier || "unknown";
      try {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        logStep("Subscription retrieved", { priceId });
        if (priceId && PRICE_TO_TIER[priceId]) {
          tier = PRICE_TO_TIER[priceId];
        }
      } catch (subError) {
        logStep("Error retrieving subscription, using profile tier", { error: subError });
      }

      // Amount is in cents, convert to dollars
      const amount = (invoice.amount_paid || 0) / 100;

      logStep("Payment details", { amount, tier });

      // Skip $0 payments (first week free)
      if (amount <= 0) {
        logStep("Skipping $0 payment (likely free trial)", { invoiceId: invoice.id });
        return new Response(JSON.stringify({ received: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Insert membership payment record
      logStep("Inserting payment record", { 
        userId: profile.user_id, 
        invoiceId: invoice.id, 
        amount, 
        tier 
      });

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
        logStep("Membership payment recorded successfully", { 
          email, 
          tier, 
          amount, 
          invoiceId: invoice.id 
        });
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
