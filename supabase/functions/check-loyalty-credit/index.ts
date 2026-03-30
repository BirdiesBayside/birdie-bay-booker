import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-LOYALTY-CREDIT] ${step}${detailsStr}`);
};

// Replace template tags with actual values
const replaceTemplateTags = (template: string, tags: Record<string, string>): string => {
  let result = template;
  for (const [tag, value] of Object.entries(tags)) {
    result = result.replace(new RegExp(tag.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  return result;
};

// Build branded email wrapper
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
  <meta name="x-apple-disable-message-reformatting" />
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
              <img
                src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603"
                width="140"
                alt="Birdies Bayside"
                style="display:block; width:140px; height:auto; border:0;"
              />
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
                    <div>Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</div>
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

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    logStep("Function started", { user_id });

    if (!user_id) {
      return new Response(
        JSON.stringify({ eligible: false, reason: "Missing user_id" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Check if loyalty promo is enabled
    const { data: settings } = await supabase
      .from("loyalty_promo_settings")
      .select("*")
      .eq("id", "global")
      .single();

    if (!settings?.enabled) {
      logStep("Loyalty promo disabled");
      return new Response(
        JSON.stringify({ eligible: false, reason: "Loyalty promo disabled" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { visit_threshold, credit_amount } = settings;

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      logStep("Profile not found", { error: profileError?.message });
      return new Response(
        JSON.stringify({ eligible: false, reason: "Profile not found" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Only visitors qualify
    if (profile.membership_tier !== "visitor") {
      logStep("Not a visitor", { tier: profile.membership_tier });
      return new Response(
        JSON.stringify({ eligible: false, reason: "Not a visitor" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const totalBookings = profile.total_bookings || 0;
    logStep("Checking milestone", { totalBookings, visit_threshold });

    // Check if they've hit a milestone (5, 10, 15, etc.)
    if (totalBookings < visit_threshold || totalBookings % visit_threshold !== 0) {
      logStep("No milestone reached");
      return new Response(
        JSON.stringify({ eligible: false, reason: "No milestone reached", totalBookings }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const milestoneNumber = totalBookings / visit_threshold;

    // Check if this milestone was already credited
    const { data: existingCredit } = await supabase
      .from("loyalty_credits_issued")
      .select("id")
      .eq("user_id", user_id)
      .eq("milestone_number", milestoneNumber)
      .maybeSingle();

    if (existingCredit) {
      logStep("Milestone already credited", { milestoneNumber });
      return new Response(
        JSON.stringify({ eligible: false, reason: "Already credited" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Issue the credit!
    const balanceBefore = profile.deposit_balance || 0;
    const newBalance = balanceBefore + credit_amount;

    // Update balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ deposit_balance: newBalance })
      .eq("id", profile.id);

    if (updateError) throw updateError;

    // Log the deposit transaction
    await supabase.from("deposit_transactions").insert({
      user_id,
      amount: credit_amount,
      balance_before: balanceBefore,
      balance_after: newBalance,
      transaction_type: "loyalty_credit",
      description: `Loyalty credit - ${totalBookings} visits milestone`,
    });

    // Record the milestone
    await supabase.from("loyalty_credits_issued").insert({
      user_id,
      milestone_number: milestoneNumber,
      total_bookings_at_issue: totalBookings,
      credit_amount,
    });

    logStep("Credit issued!", { milestoneNumber, credit_amount, newBalance });

    // Send loyalty email
    try {
      // Check if template is active
      const { data: emailTemplate } = await supabase
        .from("email_templates")
        .select("*")
        .eq("template_key", "loyalty_credit")
        .eq("is_active", true)
        .maybeSingle();

      if (emailTemplate === null) {
        logStep("Loyalty email template disabled, skipping email");
      } else {
        const templateTags: Record<string, string> = {
          '{first_name}': profile.first_name || '',
          '{last_name}': profile.last_name || '',
          '{email}': profile.email || '',
          '{credit_amount}': `$${credit_amount.toFixed(2)}`,
          '{new_balance}': `$${newBalance.toFixed(2)}`,
          '{total_visits}': String(totalBookings),
          '{next_milestone}': String(totalBookings + visit_threshold),
        };

        let subject = emailTemplate?.subject || `You've earned a $${credit_amount.toFixed(2)} Loyalty Credit! 🎉`;
        let htmlContent: string;

        if (emailTemplate?.html_content) {
          const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
          subject = replaceTemplateTags(subject, templateTags);
          htmlContent = buildEmailTemplate("Loyalty Credit Earned!", bodyContent, {
            text: "Book Now",
            url: "https://hub.birdiesbayside.com.au/booking",
          });
        } else {
          const bodyContent = `
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi ${profile.first_name}, thanks for being a loyal visitor! You've completed <strong>${totalBookings} visits</strong> to Birdies Bayside and earned a loyalty credit.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:30px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Loyalty Credit</p>
                    <p style="margin:0; font-family:Anton, Impact, Arial Black, sans-serif; font-size:52px; font-weight:bold; color:#EC622D;">$${credit_amount.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Your credit has been automatically added to your account — your new balance is <strong>$${newBalance.toFixed(2)}</strong>. Use it on your next booking!
              </p>
              <p style="margin:12px 0 0; font-family:Inter, Arial, sans-serif; font-size:13px; line-height:1.5; color:#1F4C25; text-align:center; opacity:0.7;">
                Your next loyalty credit will be earned at ${totalBookings + visit_threshold} visits. Keep it up! 💪
              </p>
          `;

          htmlContent = buildEmailTemplate("Loyalty Credit Earned!", bodyContent, {
            text: "Book Now",
            url: "https://hub.birdiesbayside.com.au/booking",
          });
        }

        await resend.emails.send({
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [profile.email],
          subject,
          html: htmlContent,
        });

        logStep("Loyalty email sent");
      }
    } catch (emailError: any) {
      logStep("Failed to send loyalty email (credit still issued)", { error: emailError.message });
    }

    return new Response(
      JSON.stringify({
        eligible: true,
        credited: true,
        credit_amount,
        new_balance: newBalance,
        milestone_number: milestoneNumber,
        total_bookings: totalBookings,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
