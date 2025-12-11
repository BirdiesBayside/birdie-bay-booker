import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CANCEL-MEMBERSHIP] ${step}${detailsStr}`);
};

const replaceTemplateTags = (content: string, data: Record<string, string>) => {
  let result = content;
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`{${key}}`, 'g'), value);
  }
  return result;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id, send_notification } = await req.json();

    if (!user_id) throw new Error("user_id is required");
    logStep("Processing cancellation", { user_id, send_notification });

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    logStep("Profile found", { email: profile.email, tier: profile.membership_tier });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find and cancel Stripe subscription
    const customers = await stripe.customers.list({ email: profile.email, limit: 1 });
    
    if (customers.data.length > 0) {
      const customerId = customers.data[0].id;
      logStep("Found Stripe customer", { customerId });

      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: "active",
        limit: 10,
      });

      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
        logStep("Cancelled subscription", { subscriptionId: sub.id });
      }
    } else {
      logStep("No Stripe customer found, skipping subscription cancellation");
    }

    // Update profile to visitor tier
    const { error: updateError } = await supabaseClient
      .from("profiles")
      .update({ membership_tier: "visitor" })
      .eq("user_id", user_id);

    if (updateError) {
      throw new Error(`Failed to update profile: ${updateError.message}`);
    }
    logStep("Updated profile to visitor tier");

    // Send notification email if requested
    if (send_notification) {
      // Fetch custom template
      const { data: template } = await supabaseClient
        .from("email_templates")
        .select("subject, html_content")
        .eq("template_key", "membership_cancelled_admin")
        .eq("is_active", true)
        .single();

      const resend = new Resend(resendApiKey);

      const defaultSubject = "Your Birdies Membership Has Been Cancelled";
      const defaultHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1f4c25; margin-bottom: 20px;">Membership Cancelled</h1>
          <p>Hi ${profile.first_name},</p>
          <p>Your Birdies membership has been cancelled. Your account is now set to Visitor status.</p>
          <p>If you have any questions about this cancellation or would like to re-subscribe, please contact us.</p>
          <p style="margin-top: 30px;">Best regards,<br>The Birdies Team</p>
        </div>
      `;

      const templateData = {
        first_name: profile.first_name,
        last_name: profile.last_name,
        email: profile.email,
        previous_tier: profile.membership_tier,
      };

      const emailSubject = template?.subject 
        ? replaceTemplateTags(template.subject, templateData) 
        : defaultSubject;
      const emailHtml = template?.html_content 
        ? replaceTemplateTags(template.html_content, templateData) 
        : defaultHtml;

      const { error: emailError } = await resend.emails.send({
        from: "Birdies <noreply@birdiesbayside.com.au>",
        to: [profile.email],
        subject: emailSubject,
        html: emailHtml,
      });

      if (emailError) {
        logStep("Failed to send email", { error: emailError });
      } else {
        logStep("Cancellation email sent");
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Membership cancelled successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
