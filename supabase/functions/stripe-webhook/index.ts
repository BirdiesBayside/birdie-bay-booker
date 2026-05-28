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

// Build branded email wrapper matching Birdies design system
const buildEmailTemplate = (heading: string, bodyContent: string, ctaButton?: { text: string; url: string }) => {
  const buttonHtml = ctaButton ? `
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="${ctaButton.url}"
                       style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      ${ctaButton.text}
                    </a>
                  </td>
                </tr>
              </table>
  ` : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Birdies Email</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <img src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603" width="140" alt="Birdies Bayside" style="display:block; width:140px; height:auto; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
                    <div><a href="https://maps.app.goo.gl/vTXLZvd8XPZEeRn16" style="color:#FFFFFF; text-decoration:underline;">Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</a></div>
                    <div><a href="tel:+61721468442" style="color:#FFFFFF; text-decoration:underline;">(07) 2146 8442</a></div>
                    <div><a href="https://birdiesbayside.com.au" style="color:#FFFFFF; text-decoration:underline;">birdiesbayside.com.au</a></div>
                    <div style="margin-top:10px; font-size:12px; opacity:0.75;">© Birdies Bayside</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
              const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
              subject = replaceTemplateTags(subject, templateTags);
              htmlContent = buildEmailTemplate(`Welcome to ${tierName}!`, bodyContent, {
                text: "Book Now",
                url: "https://hub.birdiesbayside.com.au/booking"
              });
            } else {
              const bodyContent = `
                <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                  Hi ${firstName}, congratulations! Your <strong>${tierName}</strong> membership is now active.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                  <tr>
                    <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25; text-align:center;">
                      <p style="margin:5px 0;"><strong>Membership:</strong> ${tierName}</p>
                      <p style="margin:5px 0;"><strong>Weekly Price:</strong> ${weeklyPrice}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                  You now have access to discounted bay rates and exclusive member benefits including the Birdies League!
                </p>
              `;
              htmlContent = buildEmailTemplate(`Welcome to ${tierName}!`, bodyContent, {
                text: "Book Now",
                url: "https://hub.birdiesbayside.com.au/booking"
              });
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

        const alreadyVisitor = profile?.membership_tier === "visitor";
        const firstName = profile?.first_name || customer.name?.split(" ")[0] || "there";
        const lastName = profile?.last_name || "";
        const previousTier = alreadyVisitor ? "Member" : (profile?.membership_tier ? TIER_NAMES[profile.membership_tier] || profile.membership_tier : "Member");

        // Determine if this cancellation was triggered by a payment failure
        const isPaymentFailure = subscription.metadata?.cancellation_reason === "payment_failed";
        logStep("Processing subscription deletion", { email, previousTier, isPaymentFailure, alreadyVisitor });

        if (!alreadyVisitor) {
          const { error } = await supabaseAdmin
            .from("profiles")
            .update({ membership_tier: "visitor" })
            .eq("email", email);

          if (error) {
            logStep("Error resetting profile", { error: error.message });
            throw error;
          }
          logStep("Membership tier reset to visitor");
        } else {
          logStep("Already visitor (cancelled by admin), proceeding to send email");
        }

        // Remove from SGT tour
        await removeFromSGT(supabaseAdmin, email);

        // Send ONE cancellation email — different content for payment failure vs voluntary
        if (resend) {
          const templateKey = isPaymentFailure ? "membership_payment_failed" : "membership_cancelled";
          const { data: emailTemplate } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("template_key", templateKey)
            .eq("is_active", true)
            .single();

          // Fallback: try the generic template if specific one not found
          let finalTemplate = emailTemplate;
          if (!finalTemplate && isPaymentFailure) {
            const { data: fallbackTemplate } = await supabaseAdmin
              .from("email_templates")
              .select("*")
              .eq("template_key", "membership_cancelled")
              .eq("is_active", true)
              .single();
            finalTemplate = fallbackTemplate;
          }

          const templateTags: Record<string, string> = {
            '{first_name}': firstName,
            '{last_name}': lastName,
            '{email}': email,
            '{tier_name}': previousTier,
          };

          let subject: string;
          let htmlContent: string;

          if (finalTemplate?.html_content) {
            subject = replaceTemplateTags(finalTemplate.subject || "Your Birdies Membership", templateTags);
            const bodyContent = replaceTemplateTags(finalTemplate.html_content, templateTags);
            htmlContent = buildEmailTemplate("Membership Update", bodyContent, {
              text: "View My Account",
              url: "https://hub.birdiesbayside.com.au/my-account"
            });
          } else if (isPaymentFailure) {
            // Payment failure specific default email
            subject = "Payment Failed — Your Membership Has Been Cancelled";
            htmlContent = buildEmailTemplate(
              "Payment Failed",
              `
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi ${firstName}, unfortunately your card payment for your <strong>${previousTier}</strong> membership could not be processed.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
                    <h3 style="margin:0 0 10px 0; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25;">What happened?</h3>
                    <ul style="margin:0; padding-left:20px;">
                      <li style="margin-bottom:8px;">Your card on file was declined when we tried to take your membership payment</li>
                      <li style="margin-bottom:8px;">Your membership has been cancelled and your account has been moved to <strong>Visitor</strong> status</li>
                      <li style="margin-bottom:8px;">You can still book sessions at our standard visitor rates</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                To get your membership back, simply update your payment method and re-register through your account.
              </p>
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.6; color:#1F4C25; text-align:center; opacity:0.8;">
                If you believe this was an error, please contact us and we'll help sort it out.
              </p>
              `,
              { text: "Re-Register Membership", url: "https://hub.birdiesbayside.com.au/membership" }
            );
          } else {
            // Voluntary cancellation default email
            subject = "Your Birdies Membership Has Been Cancelled";
            htmlContent = buildEmailTemplate(
              "Membership Cancelled",
              `
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi ${firstName}, your <strong>${previousTier}</strong> membership has been cancelled.
              </p>
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Your account has been reverted to Visitor status. You can still book sessions at our standard visitor rates.
              </p>
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                If you'd like to rejoin, simply re-register for a membership through your account.
              </p>
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                We hope to see you back soon!<br/>
                <strong>The Birdies Team</strong>
              </p>
              `,
              { text: "Rejoin Membership", url: "https://hub.birdiesbayside.com.au/membership" }
            );
          }

          try {
            await resend.emails.send({
              from: "Birdies Bayside <info@birdiesbayside.com.au>",
              to: [email],
              subject: subject,
              html: htmlContent,
            });
            logStep("Membership cancellation email sent", { email, isPaymentFailure });
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
    // Soft-retry policy:
    //   attempt_count === 1 → send friendly heads-up, let Stripe Smart Retries handle it
    //   attempt_count >= 2  → cancel sub + void invoice (existing destructive flow)
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      const attemptCount = (invoice as any).attempt_count ?? 1;

      let subscriptionId = invoice.subscription as string | null;
      if (!subscriptionId && (invoice as any).parent?.subscription_details?.subscription) {
        subscriptionId = (invoice as any).parent.subscription_details.subscription;
      }

      logStep("Payment failed", { invoiceId: invoice.id, subscriptionId, attemptCount });

      if (subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.pause_collection) {
            logStep("Subscription is paused (membership on hold), skipping", {
              subscriptionId,
              pauseBehavior: subscription.pause_collection.behavior,
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
        let firstName = "";
        let userId: string | null = null;
        if (email) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("user_id, custom_billing, first_name")
            .eq("email", email)
            .maybeSingle();

          if (profile?.custom_billing) {
            logStep("Customer has custom billing, skipping cancellation", { email });
            return new Response(JSON.stringify({ received: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          firstName = profile?.first_name ?? "";
          userId = profile?.user_id ?? null;
        }

        // First failure: flag profile, cancel + refund all future bookings, send heads-up
        if (attemptCount < 2) {
          let cancelledCount = 0;

          if (userId) {
            // Flag profile so new bookings are blocked by DB trigger
            await supabaseAdmin
              .from("profiles")
              .update({ payment_failed_at: new Date().toISOString() })
              .eq("user_id", userId);
            logStep("Profile flagged with payment_failed_at", { userId });

            // Fetch future confirmed bookings (Brisbane today onward)
            const brisbaneToday = new Date(
              new Date().toLocaleString("en-US", { timeZone: "Australia/Brisbane" })
            )
              .toISOString()
              .slice(0, 10);

            const { data: futureBookings } = await supabaseAdmin
              .from("bookings")
              .select("id, stripe_payment_intent_id, payment_method, total_price, user_id")
              .eq("user_id", userId)
              .in("status", ["confirmed", "pending"])
              .gte("booking_date", brisbaneToday);

            for (const b of futureBookings ?? []) {
              // Stripe refund
              if (
                b.stripe_payment_intent_id &&
                (b.payment_method === "stripe" || b.payment_method === "card")
              ) {
                try {
                  await stripe.refunds.create({
                    payment_intent: b.stripe_payment_intent_id,
                    reason: "requested_by_customer",
                  });
                } catch (refundErr) {
                  logStep("Refund failed for booking (continuing)", {
                    bookingId: b.id,
                    error: refundErr,
                  });
                }
              } else if (b.payment_method === "balance" || b.payment_method === "partial") {
                // Credit balance refund
                const amount = parseFloat(b.total_price as any) || 0;
                if (amount > 0) {
                  const { data: prof } = await supabaseAdmin
                    .from("profiles")
                    .select("deposit_balance")
                    .eq("user_id", b.user_id)
                    .single();
                  const current = parseFloat((prof?.deposit_balance as any) ?? 0);
                  const newBal = current + amount;
                  await supabaseAdmin
                    .from("profiles")
                    .update({ deposit_balance: newBal })
                    .eq("user_id", b.user_id);
                  await supabaseAdmin.from("deposit_transactions").insert({
                    user_id: b.user_id,
                    amount,
                    balance_before: current,
                    balance_after: newBal,
                    transaction_type: "refund",
                    description: "Booking cancelled — membership payment failed",
                    related_booking_id: b.id,
                  });
                }
              }

              // Mark cancelled with reason
              await supabaseAdmin
                .from("bookings")
                .update({
                  status: "cancelled",
                  cancellation_reason: "Membership payment failed — booking refunded",
                })
                .eq("id", b.id);
              cancelledCount++;

            }
            logStep("Cancelled future bookings due to payment failure", {
              userId,
              cancelledCount,
            });
          }

          if (email) {
            try {
              const amountDollars = (invoice.amount_due ?? 0) / 100;
              await supabaseAdmin.functions.invoke("send-payment-retry-warning", {
                body: {
                  email,
                  first_name: firstName,
                  amount: amountDollars,
                  cancelled_bookings: cancelledCount,
                },
              });
              logStep("Heads-up email sent", { email, amount: amountDollars, cancelledCount });
            } catch (emailErr) {
              logStep("Failed to send heads-up email (non-blocking)", { error: emailErr });
            }
          }
          return new Response(
            JSON.stringify({ received: true, action: "blocked_and_cancelled", cancelledCount }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }


        // Second+ failure: cancel + void
        try {
          await stripe.subscriptions.update(subscriptionId, {
            metadata: { cancellation_reason: "payment_failed" },
          });
          await stripe.subscriptions.cancel(subscriptionId);
          logStep("Subscription cancelled after retry failure", { subscriptionId, attemptCount });
        } catch (cancelError) {
          logStep("Failed to cancel subscription", { error: cancelError });
        }

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

      // Clear payment_failed_at flag so customer can book again
      const { error: clearError } = await supabaseAdmin
        .from("profiles")
        .update({ payment_failed_at: null })
        .eq("user_id", profile.user_id)
        .not("payment_failed_at", "is", null);
      if (!clearError) {
        logStep("Cleared payment_failed_at flag", { userId: profile.user_id });
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
