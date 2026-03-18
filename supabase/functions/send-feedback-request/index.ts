import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[FEEDBACK-REQUEST] ${step}${detailsStr}`);
};

const SITE_URL = Deno.env.get("SITE_URL") || "https://birdie-bay-bookings.lovable.app";

const buildFeedbackEmail = (firstName: string, feedbackUrl: string) => {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <!-- HEADER -->
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
          <!-- BODY -->
          <tr>
            <td style="background-color:#FFF5E4; padding:30px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 16px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:30px; line-height:1.1; color:#1F4C25; text-align:center;">
                HOW WAS YOUR VISIT?
              </h1>
              <p style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center; margin:0 0 8px;">
                Hey {{first_name}},
              </p>
              <p style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center; margin:0 0 24px;">
                Thanks for visiting Birdies! We'd love to know how your experience was — it only takes 10 seconds.
              </p>
              
              <!-- FEEDBACK BUTTONS -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px;">
                <tr>
                  <td style="padding:0 8px;">
                    <a href="{{feedback_url}}&quick=bad" style="display:inline-block; padding:14px 20px; font-family:Inter, Arial, sans-serif; font-size:28px; text-decoration:none; background-color:#FEE2E2; border-radius:12px; text-align:center;">
                      😞
                    </a>
                  </td>
                  <td style="padding:0 8px;">
                    <a href="{{feedback_url}}&quick=ok" style="display:inline-block; padding:14px 20px; font-family:Inter, Arial, sans-serif; font-size:28px; text-decoration:none; background-color:#FEF3C7; border-radius:12px; text-align:center;">
                      😐
                    </a>
                  </td>
                  <td style="padding:0 8px;">
                    <a href="{{feedback_url}}&quick=good" style="display:inline-block; padding:14px 20px; font-family:Inter, Arial, sans-serif; font-size:28px; text-decoration:none; background-color:#D1FAE5; border-radius:12px; text-align:center;">
                      😊
                    </a>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 8px 0; text-align:center; font-family:Inter, Arial, sans-serif; font-size:12px; color:#1F4C25;">Bad</td>
                  <td style="padding:4px 8px 0; text-align:center; font-family:Inter, Arial, sans-serif; font-size:12px; color:#1F4C25;">OK</td>
                  <td style="padding:4px 8px 0; text-align:center; font-family:Inter, Arial, sans-serif; font-size:12px; color:#1F4C25;">Good</td>
                </tr>
              </table>

              <p style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.5; color:#1F4C25; text-align:center; opacity:0.7; margin:0;">
                Tap an emoji above or click below to leave more detailed feedback
              </p>

              <!-- CTA BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:16px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="{{feedback_url}}"
                       style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      GIVE FEEDBACK
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- FOOTER -->
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

// Render template by replacing placeholders
const renderTemplate = (template: string, vars: Record<string, string>) => {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    const cutoffDate = fourteenDaysAgo.toISOString().split("T")[0];

    // Try to load template from email_templates table
    let emailTemplate = buildFeedbackEmail("", "");
    const { data: templateRow } = await supabase
      .from("email_templates")
      .select("html_content")
      .eq("template_key", "feedback_request")
      .eq("is_active", true)
      .single();

    if (templateRow?.html_content) {
      emailTemplate = templateRow.html_content;
      logStep("Using template from email_templates table");
    } else {
      // Use the hardcoded default
      emailTemplate = buildFeedbackEmail("{{first_name}}", "{{feedback_url}}");
      logStep("Using default hardcoded template");
    }

    // Batch approach: get all profiles + all bookings in 2 queries
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, marketing_opt_out");

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No profiles" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get already-sent user IDs
    const { data: alreadySent } = await supabase
      .from("feedback_emails_sent")
      .select("user_id");
    const sentUserIds = new Set((alreadySent || []).map((s: any) => s.user_id));

    // Get all confirmed bookings (only need user_id and booking_date)
    const { data: allBookings } = await supabase
      .from("bookings")
      .select("user_id, booking_date")
      .eq("status", "confirmed")
      .order("booking_date", { ascending: false });

    // Build a map: user_id -> { lastBookingDate, count }
    const bookingMap = new Map<string, { lastDate: string; count: number }>();
    for (const b of (allBookings || [])) {
      const existing = bookingMap.get(b.user_id);
      if (!existing) {
        bookingMap.set(b.user_id, { lastDate: b.booking_date, count: 1 });
      } else {
        existing.count++;
        if (b.booking_date > existing.lastDate) {
          existing.lastDate = b.booking_date;
        }
      }
    }

    logStep("Data loaded", { profiles: profiles.length, bookings: allBookings?.length, alreadySent: sentUserIds.size });

    // Find candidates
    const candidates: Array<{ user_id: string; email: string; first_name: string }> = [];
    for (const profile of profiles) {
      if (sentUserIds.has(profile.user_id)) continue;
      if (profile.marketing_opt_out) continue;

      const bookingInfo = bookingMap.get(profile.user_id);
      if (!bookingInfo) continue; // no bookings at all

      // Last booking must be 14+ days ago
      if (bookingInfo.lastDate > cutoffDate) continue;

      candidates.push({
        user_id: profile.user_id,
        email: profile.email,
        first_name: profile.first_name,
      });
    }

    logStep("Eligible candidates", { count: candidates.length });

    let sentCount = 0;

    for (const user of candidates) {
      try {
        // Create tracking record
        const { data: trackingRecord, error: insertError } = await supabase
          .from("feedback_emails_sent")
          .insert({ user_id: user.user_id, email: user.email })
          .select("id")
          .single();

        if (insertError) {
          logStep("Skip - insert error", { email: user.email, error: insertError.message });
          continue;
        }

        const token = trackingRecord.id;
        const feedbackUrl = `${SITE_URL}/feedback?token=${token}`;

        const renderedHtml = renderTemplate(emailTemplate, {
          first_name: user.first_name || "there",
          feedback_url: feedbackUrl,
        });

        await resend.emails.send({
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [user.email],
          subject: "How was your visit to Birdies? 🏌️",
          html: renderedHtml,
        });

        sentCount++;
        logStep("Email sent", { email: user.email });

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 200));
      } catch (err: any) {
        logStep("Error sending to user", { email: user.email, error: err.message });
      }
    }

    logStep("Complete", { totalSent: sentCount });

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, eligible: candidates.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
