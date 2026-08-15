import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

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

    const visit_threshold = settings.visit_threshold;
    const credit_hours = Number(settings.credit_hours ?? 1);

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

    // Issue the hour credit!
    const balanceBefore = Number(profile.hour_credit_balance || 0);
    const newBalance = balanceBefore + credit_hours;
    const hoursLabel = `${credit_hours} ${credit_hours === 1 ? "hour" : "hours"}`;
    const balanceLabel = `${newBalance} ${newBalance === 1 ? "hour" : "hours"}`;

    // Update hour credit balance
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ hour_credit_balance: newBalance })
      .eq("id", profile.id);

    if (updateError) throw updateError;

    // Log the hour credit transaction
    await supabase.from("hour_credit_transactions").insert({
      user_id,
      amount: credit_hours,
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
      credit_amount: 0,
      credit_hours,
    });

    logStep("Hour credit issued!", { milestoneNumber, credit_hours, newBalance });

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
          '{credit_hours}': hoursLabel,
          '{credit_amount}': hoursLabel,
          '{new_balance}': balanceLabel,
          '{hour_balance}': balanceLabel,
          '{total_visits}': String(totalBookings),
          '{next_milestone}': String(totalBookings + visit_threshold),
        };

        let subject = emailTemplate?.subject || `You've earned ${hoursLabel} of FREE play! 🎉`;
        let htmlContent: string;

        if (emailTemplate?.html_content) {
          const bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
          subject = replaceTemplateTags(subject, templateTags);
          htmlContent = await renderBrandedEmail(supabase, "Loyalty Reward Earned!", bodyContent, {
            text: "Book Now",
            url: "https://hub.birdiesbayside.com.au/booking",
          });
        } else {
          const bodyContent = `
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi ${profile.first_name}, thanks for being a loyal visitor! You've completed <strong>${totalBookings} visits</strong> to Birdies Bayside and earned free bay time.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:30px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Loyalty Reward</p>
                    <p style="margin:0; font-family:Anton, Impact, Arial Black, sans-serif; font-size:52px; font-weight:bold; color:#EC622D;">${hoursLabel.toUpperCase()}</p>
                    <p style="margin:8px 0 0; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">of free bay time</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                It's already on your account — you now have <strong>${balanceLabel}</strong> of free play banked. Just pick your bay and it'll be applied at checkout.
              </p>
              <p style="margin:12px 0 0; font-family:Inter, Arial, sans-serif; font-size:13px; line-height:1.5; color:#1F4C25; text-align:center; opacity:0.7;">
                Your next loyalty reward will be earned at ${totalBookings + visit_threshold} visits. Keep it up! 💪
              </p>
          `;

          htmlContent = await renderBrandedEmail(supabase, "Loyalty Reward Earned!", bodyContent, {
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
        credit_hours,
        new_hour_balance: newBalance,
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
