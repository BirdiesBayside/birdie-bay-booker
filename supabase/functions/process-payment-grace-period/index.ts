import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GRACE-PERIOD] ${step}${detailsStr}`);
};

const TIER_NAMES: Record<string, string> = {
  "weekday": "Weekday",
  "birdie": "Birdie",
  "eagle": "Eagle",
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Grace period enforcement started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!stripeKey) {
      throw new Error("Missing STRIPE_SECRET_KEY");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Find profiles where grace period has expired (24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    const { data: overdueProfiles, error: queryError } = await supabaseAdmin
      .from("profiles")
      .select("id, email, first_name, last_name, membership_tier, payment_failed_at, custom_billing")
      .not("payment_failed_at", "is", null)
      .lt("payment_failed_at", twentyFourHoursAgo);

    if (queryError) {
      logStep("Error querying overdue profiles", { error: queryError.message });
      throw queryError;
    }

    logStep("Found overdue profiles", { count: overdueProfiles?.length || 0 });

    const results = {
      processed: 0,
      downgraded: 0,
      recovered: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const profile of overdueProfiles || []) {
      try {
        logStep("Processing profile", { email: profile.email, gracePeriodStart: profile.payment_failed_at });

        // Skip custom billing customers
        if (profile.custom_billing) {
          logStep("Skipping custom billing customer", { email: profile.email });
          results.skipped++;
          continue;
        }

        // Find customer in Stripe
        const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
        if (customers.data.length === 0) {
          logStep("No Stripe customer found, clearing grace period", { email: profile.email });
          await supabaseAdmin
            .from("profiles")
            .update({ payment_failed_at: null })
            .eq("id", profile.id);
          results.skipped++;
          continue;
        }

        const customerId = customers.data[0].id;

        // Check if they have any open invoices still
        const openInvoices = await stripe.invoices.list({
          customer: customerId,
          status: "open",
          limit: 1,
        });

        // Check current subscription status
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          limit: 1,
        });

        const subscription = subscriptions.data[0];

        // If no open invoices, they recovered (maybe paid through another channel)
        if (openInvoices.data.length === 0) {
          logStep("No open invoices - customer recovered", { email: profile.email });
          await supabaseAdmin
            .from("profiles")
            .update({ payment_failed_at: null })
            .eq("id", profile.id);
          results.recovered++;
          continue;
        }

        // If subscription is active, they recovered
        if (subscription?.status === "active") {
          logStep("Subscription is active - customer recovered", { email: profile.email });
          await supabaseAdmin
            .from("profiles")
            .update({ payment_failed_at: null })
            .eq("id", profile.id);
          results.recovered++;
          continue;
        }

        // Grace period expired and still unpaid - downgrade to visitor
        logStep("Grace period expired, downgrading to visitor", { 
          email: profile.email, 
          previousTier: profile.membership_tier 
        });

        const previousTier = TIER_NAMES[profile.membership_tier] || profile.membership_tier;

        // Cancel the subscription in Stripe
        if (subscription) {
          try {
            await stripe.subscriptions.cancel(subscription.id);
            logStep("Subscription cancelled", { subscriptionId: subscription.id });
          } catch (cancelError) {
            logStep("Failed to cancel subscription", { error: cancelError });
          }
        }

        // Void the open invoice to clean up
        try {
          await stripe.invoices.voidInvoice(openInvoices.data[0].id);
          logStep("Open invoice voided", { invoiceId: openInvoices.data[0].id });
        } catch (voidError) {
          logStep("Failed to void invoice (may already be finalized)", { error: voidError });
        }

        // Update profile - reset tier and clear grace period
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ 
            membership_tier: "visitor",
            payment_failed_at: null 
          })
          .eq("id", profile.id);

        if (updateError) {
          logStep("Error updating profile", { error: updateError.message });
          results.errors.push(`${profile.email}: ${updateError.message}`);
          continue;
        }

        logStep("Profile downgraded to visitor", { email: profile.email });

        // Send membership cancelled email
        if (resend) {
          const { data: emailTemplate } = await supabaseAdmin
            .from("email_templates")
            .select("*")
            .eq("template_key", "membership_cancelled")
            .eq("is_active", true)
            .single();

          if (emailTemplate?.html_content) {
            const templateTags: Record<string, string> = {
              '{first_name}': profile.first_name || 'there',
              '{last_name}': profile.last_name || '',
              '{email}': profile.email,
              '{tier_name}': previousTier,
            };

            const subject = replaceTemplateTags(emailTemplate.subject || "Your Birdies Membership Has Been Cancelled", templateTags);
            const htmlContent = replaceTemplateTags(emailTemplate.html_content, templateTags);

            try {
              await resend.emails.send({
                from: "Birdies Bayside <info@birdiesbayside.com.au>",
                to: [profile.email],
                subject: subject,
                html: htmlContent,
              });
              logStep("Membership cancelled email sent", { email: profile.email });
            } catch (emailError) {
              logStep("Failed to send cancellation email", { error: emailError });
            }
          }
        }

        results.downgraded++;
        results.processed++;

      } catch (profileError) {
        const errorMessage = profileError instanceof Error ? profileError.message : String(profileError);
        logStep("Error processing profile", { email: profile.email, error: errorMessage });
        results.errors.push(`${profile.email}: ${errorMessage}`);
      }
    }

    logStep("Grace period enforcement complete", results);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
