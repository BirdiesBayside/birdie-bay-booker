import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-PAYMENT-FAILED] ${step}${detailsStr}`);
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
    logStep("Function started");

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Missing RESEND_API_KEY");
    }

    const resend = new Resend(resendApiKey);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { emails } = await req.json();
    
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      throw new Error("Missing emails array");
    }

    logStep("Processing emails", { count: emails.length });

    // Fetch the payment_failed template
    const { data: emailTemplate } = await supabaseAdmin
      .from("email_templates")
      .select("*")
      .eq("template_key", "payment_failed")
      .eq("is_active", true)
      .single();

    if (!emailTemplate || !emailTemplate.html_content) {
      throw new Error("Payment failed email template not found");
    }

    const results = [];

    for (const emailAddress of emails) {
      logStep("Looking up profile", { email: emailAddress });

      // Get profile info
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("first_name, last_name, email")
        .eq("email", emailAddress)
        .maybeSingle();

      if (!profile) {
        logStep("Profile not found", { email: emailAddress });
        results.push({ email: emailAddress, success: false, error: "Profile not found" });
        continue;
      }

      const firstName = profile.first_name || "there";
      const lastName = profile.last_name || "";

      const templateTags: Record<string, string> = {
        '{first_name}': firstName,
        '{last_name}': lastName,
        '{email}': emailAddress,
        '{tier_name}': 'Member',
      };

      const subject = replaceTemplateTags(emailTemplate.subject || "Payment Failed - Birdies", templateTags);
      const htmlContent = replaceTemplateTags(emailTemplate.html_content, templateTags);

      try {
        await resend.emails.send({
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [emailAddress],
          subject: subject,
          html: htmlContent,
        });
        logStep("Email sent successfully", { email: emailAddress });
        results.push({ email: emailAddress, success: true });
      } catch (emailError) {
        const errorMsg = emailError instanceof Error ? emailError.message : String(emailError);
        logStep("Failed to send email", { email: emailAddress, error: errorMsg });
        results.push({ email: emailAddress, success: false, error: errorMsg });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
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
