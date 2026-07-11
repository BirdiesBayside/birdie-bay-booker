import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  booking_id: string;
  notification_type: "confirmation" | "cancellation" | "reschedule";
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-BOOKING-NOTIFICATION] ${step}${detailsStr}`);
};

// Format phone number for SMS Broadcast (Australian format)
const formatPhoneForSMS = (phone: string | null): string | null => {
  if (!phone) return null;
  
  // Remove all non-numeric characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Convert to international format without + (614xxxxxxxx)
  if (cleaned.startsWith('0')) {
    cleaned = '61' + cleaned.slice(1);
  } else if (cleaned.startsWith('+61')) {
    cleaned = cleaned.slice(1);
  } else if (!cleaned.startsWith('61') && cleaned.length === 9) {
    // Assume Australian mobile missing leading 0
    cleaned = '61' + cleaned;
  }
  
  // Validate length (should be 11 digits for Australian mobile)
  if (cleaned.length !== 11 || !cleaned.startsWith('614')) {
    logStep("Invalid phone number format", { original: phone, cleaned });
    return null;
  }
  
  return cleaned;
};

// Send SMS via SMS Broadcast API
const sendSMS = async (phone: string, message: string): Promise<{ success: boolean; response?: string; error?: string }> => {
  const username = Deno.env.get("SMS_BROADCAST_USERNAME");
  const password = Deno.env.get("SMS_BROADCAST_PASSWORD");
  
  if (!username || !password) {
    logStep("SMS Broadcast credentials not configured");
    return { success: false, error: "SMS credentials not configured" };
  }
  
  const formattedPhone = formatPhoneForSMS(phone);
  if (!formattedPhone) {
    return { success: false, error: "Invalid phone number" };
  }
  
  try {
    const params = new URLSearchParams({
      username,
      password,
      to: formattedPhone,
      from: "Birdies",
      message: message,
    });
    
    const response = await fetch(`https://api.smsbroadcast.com.au/api-adv.php?${params.toString()}`, {
      method: "GET",
    });
    
    const responseText = await response.text();
    logStep("SMS Broadcast response", { response: responseText });
    
    // Parse response - format is "OK:614xxxxxxxx:reference" or "ERROR:message"
    if (responseText.startsWith("OK:")) {
      return { success: true, response: responseText };
    } else {
      return { success: false, error: responseText };
    }
  } catch (error: any) {
    logStep("SMS send error", { error: error.message });
    return { success: false, error: error.message };
  }
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
              <!-- BUTTON -->
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
        <!-- CONTAINER -->
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
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <!-- SOCIAL ICONS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <!-- Instagram -->
                    <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <!-- Facebook -->
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <!-- CONTACT DETAILS -->
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
        <!-- /CONTAINER -->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { booking_id, notification_type }: NotificationRequest = await req.json();
    logStep("Request received", { booking_id, notification_type });

    if (!booking_id || !notification_type) {
      throw new Error("Missing booking_id or notification_type");
    }

    // Fetch booking details with bay info
    const { data: booking, error: bookingError } = await supabaseClient
      .from("bookings")
      .select(`
        *,
        bays (name, bay_number)
      `)
      .eq("id", booking_id)
      .single();

    if (bookingError || !booking) {
      throw new Error(`Failed to fetch booking: ${bookingError?.message}`);
    }
    logStep("Booking fetched", { booking_id: booking.id, user_id: booking.user_id });

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", booking.user_id)
      .single();

    if (profileError || !profile) {
      throw new Error(`Failed to fetch profile: ${profileError?.message}`);
    }
    logStep("Profile fetched", { email: profile.email, phone: profile.phone });

    // Determine whether the booking start falls inside a staffed window.
    // Used for the {staffed_status} merge tag in all booking emails/SMS,
    // and to swap in the first-time-unstaffed confirmation template.
    let insideStaffed = true;
    try {
      const bookingDay = new Date(`${booking.booking_date}T00:00:00`).getDay(); // 0=Sun
      const { data: staffed } = await supabaseClient
        .from("staffed_hours")
        .select("start_time, end_time, is_staffed")
        .eq("day_of_week", bookingDay);
      const start = booking.start_time as string; // HH:MM:SS
      insideStaffed = (staffed || []).some(
        (s: any) => s.is_staffed && s.start_time <= start && start < s.end_time,
      );
      logStep("Staffed window check", { bookingDay, start, insideStaffed });
    } catch (e: any) {
      logStep("Staffed detection failed (defaulting to staffed)", { error: e.message });
    }
    const staffedStatus = insideStaffed ? "Staffed hours" : "Unstaffed hours";

    let isFirstTimeUnstaffed = false;
    if (notification_type === "confirmation" && !insideStaffed) {
      try {
        const { count: priorConfirmed } = await supabaseClient
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", booking.user_id)
          .eq("status", "confirmed")
          .neq("id", booking.id);
        isFirstTimeUnstaffed = (priorConfirmed ?? 0) === 0;
        logStep("First-time unstaffed check", { priorConfirmed, isFirstTimeUnstaffed });
      } catch (e: any) {
        logStep("First-time detection failed", { error: e.message });
      }
    }

    // Fetch custom email template.
    // First-time bookings during unstaffed hours use their own dedicated template
    // that admins edit directly in the Notifications settings.
    const templateKey =
      notification_type === "confirmation"
        ? (isFirstTimeUnstaffed ? "booking_confirmation_first_unstaffed" : "booking_confirmation")
        : "booking_cancellation";
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", templateKey)
      .single();
    
    if (templateError) {
      logStep("Template fetch error (using default)", { error: templateError.message });
    } else {
      logStep("Template fetched", { templateKey, hasCustomHtml: !!emailTemplate?.html_content, isActive: emailTemplate?.is_active });
    }


    // Check if template is disabled - skip sending if so
    if (emailTemplate && emailTemplate.is_active === false) {
      logStep("Template is disabled, skipping email notification");
      return new Response(
        JSON.stringify({ 
          success: true, 
          email_sent: false,
          sms_sent: false,
          message: `${notification_type} notification skipped - template disabled` 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Format booking details
    const bookingDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const shortDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const startTime = booking.start_time.slice(0, 5);
    const endTime = booking.end_time.slice(0, 5);
    const bayNumber = booking.bays?.bay_number || "?";
    const bayName = booking.bays?.name || `Bay ${bayNumber}`;
    
    // Format time for display (12-hour format)
    const formatTime12hr = (time24: string) => {
      const [hours, minutes] = time24.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };
    const startTime12hr = formatTime12hr(startTime);
    const endTime12hr = formatTime12hr(endTime);
    
    // Check if booking needs boom gate access (5-6am or 5pm onwards)
    const startHour = parseInt(booking.start_time.split(':')[0], 10);
    const needsBoomGate = (startHour >= 5 && startHour < 7) || startHour >= 17;

    // Load door code from system settings (falls back to 7675#)
    const { data: sysSettings } = await supabaseClient
      .from("system_settings")
      .select("door_code")
      .eq("id", "global")
      .maybeSingle();
    const doorCode = (sysSettings as any)?.door_code || "7675#";

    // SMS-specific short date / 24h times (used by cancellation template)
    const formattedSmsDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Template replacement tags (shared by email + SMS)
    const templateTags: Record<string, string> = {
      '{first_name}': profile.first_name || '',
      '{last_name}': profile.last_name || '',
      '{email}': profile.email || '',
      '{booking_date}': bookingDate,
      '{booking_time}': startTime12hr,
      '{end_time}': endTime12hr,
      '{duration}': booking.duration_hours.toString(),
      '{bay_number}': bayNumber.toString(),
      '{bay_name}': bayName,
      '{player_count}': booking.player_count.toString(),
      '{total_price}': `$${booking.total_price.toFixed(2)}`,
      '{door_code}': doorCode,
      '{short_date}': formattedSmsDate,
      '{start_time_24}': startTime,
      '{end_time_24}': endTime,
      '{refund_amount}': '', // Will be populated if refund occurred
    };

    // Helper to render an SMS template from the sms_templates table.
    // Returns null when the template is missing or disabled (skip send).
    const renderSmsTemplate = async (templateKey: string): Promise<string | null> => {
      const { data: tpl } = await supabaseClient
        .from("sms_templates")
        .select("message, is_active")
        .eq("template_key", templateKey)
        .maybeSingle();
      if (!tpl || !(tpl as any).is_active || !(tpl as any).message) return null;
      let out = (tpl as any).message as string;
      for (const [tag, value] of Object.entries(templateTags)) {
        out = out.split(tag).join(value);
      }
      return out;
    };

    // Email content based on notification type
    let subject: string;
    let htmlContent: string;
    let smsMessage: string;

    // Check if user has already been approved for Google review reward
    let hasReviewReward = false;
    if (notification_type === "confirmation") {
      const { data: reviewReward } = await supabaseClient
        .from("google_review_rewards")
        .select("id")
        .eq("user_id", booking.user_id)
        .maybeSingle();
      hasReviewReward = !!reviewReward;
      logStep("Review reward check", { hasReviewReward });
    }

    if (notification_type === "confirmation" || notification_type === "reschedule") {
      // Use custom subject if available
      const isReschedule = notification_type === "reschedule";
      subject = isReschedule 
        ? "Booking Rescheduled - Birdies Bayside"
        : (emailTemplate?.subject || "Booking Confirmed - Birdies Bayside");
      
      // Main booking SMS — pulled from editable sms_templates table
      const smsKey = isReschedule
        ? "booking_reschedule"
        : (isFirstTimeUnstaffed ? "booking_confirmation_first_unstaffed" : "booking_confirmation");

      smsMessage = (await renderSmsTemplate(smsKey)) ?? "";


      // Build Google Review CTA block (only for confirmations, not reschedules, and not if already rewarded)
      const reviewCtaHtml = (!isReschedule && !hasReviewReward) ? `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border:1px solid rgba(31,76,37,0.12);">
                <tr>
                  <td style="padding:20px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; color:#1F4C25;">
                      ENJOYING BIRDIES? ⭐
                    </p>
                    <p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#1F4C25; line-height:1.5;">
                      Leave us a Google Review and receive <strong>$15 credit</strong> on your next visit!
                    </p>
                    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#EC622D" style="border-radius:8px;">
                          <a href="https://g.page/r/CSMrsLoxE318EBM/review"
                             style="display:inline-block; padding:10px 20px; font-family:Inter, Arial, sans-serif; font-size:14px; font-weight:600; color:#FFFFFF; text-decoration:none;">
                            Leave a Review →
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
      ` : '';




      const headingText = isReschedule ? "Booking Rescheduled!" : "Booking Confirmed!";
      
      // Check if custom template exists (only for confirmation, not reschedule)
      if (!isReschedule && emailTemplate?.html_content) {
        let bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
        // Insert Google Review CTA after "First Time at Birdies?" section
        if (reviewCtaHtml) {
          const firstTimeIndex = bodyContent.indexOf('First Time at Birdies');
          if (firstTimeIndex !== -1) {
            const afterFirstTime = bodyContent.indexOf('</table>', firstTimeIndex);
            if (afterFirstTime !== -1) {
              const insertAt = afterFirstTime + '</table>'.length;
              bodyContent = bodyContent.slice(0, insertAt) + reviewCtaHtml + bodyContent.slice(insertAt);
            }
          } else {
            const lookForwardIndex = bodyContent.indexOf('We look forward');
            if (lookForwardIndex !== -1) {
              bodyContent = bodyContent.slice(0, lookForwardIndex) + reviewCtaHtml + bodyContent.slice(lookForwardIndex);
            }
          }
        }
        htmlContent = buildEmailTemplate(headingText, bodyContent, {
          text: "View My Bookings",
          url: "https://hub.birdiesbayside.com.au/my-bookings"
        });
        logStep("Using custom email template with wrapper", { reviewCtaInjected: !!reviewCtaHtml, templateKey });
      } else {
        const introText = isReschedule 
          ? `Hi ${profile.first_name}, your golf simulator booking has been successfully rescheduled!`
          : `Hi ${profile.first_name}, your golf simulator booking has been confirmed!`;
        
        const bodyContent = `
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                ${introText}
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
                    <p style="margin:5px 0;"><strong>Date:</strong> ${bookingDate}</p>
                    <p style="margin:5px 0;"><strong>Time:</strong> ${startTime12hr} - ${endTime12hr}</p>
                    <p style="margin:5px 0;"><strong>Duration:</strong> ${booking.duration_hours} hour${booking.duration_hours > 1 ? "s" : ""}</p>
                    <p style="margin:5px 0;"><strong>Bay:</strong> ${bayName}</p>
                    <p style="margin:5px 0;"><strong>Players:</strong> ${booking.player_count}</p>
                    <p style="margin:5px 0;"><strong>Total:</strong> $${booking.total_price.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#FFF5E4; text-align:center;">
                    <p style="margin:0 0 10px 0;"><strong>Door Access Code:</strong> 7675#</p>
                    ${needsBoomGate ? `
                    <p style="margin:0; font-size:14px;">
                      <strong>IMPORTANT:</strong> You will require Boom gate access for your booking time.<br/>
                      <a href="https://birdiesbayside.com.au/gate-access" style="color:#EC622D;">Request gate access here</a>
                    </p>
                    ` : ''}
                  </td>
                </tr>
              </table>

              

              ${reviewCtaHtml}
              
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                We look forward to seeing you at Birdies Bayside!
              </p>
        `;
        
        htmlContent = buildEmailTemplate(headingText, bodyContent, {
          text: "View My Bookings",
          url: "https://hub.birdiesbayside.com.au/my-bookings"
        });
      }
    } else if (notification_type === "cancellation") {
      // Cancellation
      subject = emailTemplate?.subject || "Booking Cancelled - Birdies Bayside";
      smsMessage = (await renderSmsTemplate("booking_cancellation")) ?? "";
      
      let bodyContent: string;
      if (emailTemplate?.html_content) {
        bodyContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
        logStep("Using custom email template with wrapper");
      } else {
        bodyContent = `
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                Hi ${profile.first_name}, your booking has been cancelled.
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #666666;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
                    <p style="margin:5px 0;"><strong>Date:</strong> ${bookingDate}</p>
                    <p style="margin:5px 0;"><strong>Time:</strong> ${startTime12hr} - ${endTime12hr}</p>
                    <p style="margin:5px 0;"><strong>Bay:</strong> ${bayName}</p>
                  </td>
                </tr>
              </table>
              
              <p style="margin:18px 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                If you didn't request this cancellation or need assistance, please contact us.
              </p>
              
              <p style="margin:0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                We hope to see you again soon at Birdies Bayside!
              </p>
        `;
      }
      htmlContent = buildEmailTemplate("Booking Cancelled", bodyContent, {
        text: "Book Again",
        url: "https://hub.birdiesbayside.com.au/booking"
      });
    } else {
      throw new Error(`Unknown notification type: ${notification_type}`);
    }

    // Apply tag replacement to subject if custom
    if (emailTemplate?.subject) {
      subject = replaceTemplateTags(subject, templateTags);
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Birdies Bayside <info@birdiesbayside.com.au>",
      to: [profile.email],
      subject: subject,
      html: htmlContent,
    });

    logStep("Email sent successfully", { emailResponse });

    // Send admin alert if this customer has the booking flag enabled
    if (notification_type === "confirmation" && (profile as any).booking_flag_enabled === true) {
      try {
        logStep("Flagged customer booked - sending admin alert", { email: profile.email });

        const { data: alertTpl } = await supabaseClient
          .from("email_templates")
          .select("subject, html_content, is_active")
          .eq("template_key", "watched_customer_alert")
          .maybeSingle();

        if (alertTpl && (alertTpl as any).is_active === false) {
          logStep("Watched customer alert template disabled, skipping");
        } else {
          const alertTagsExt = {
            ...templateTags,
            '{phone}': profile.phone || 'Not provided',
            '{membership_tier}': profile.membership_tier || 'Visitor',
          };
          const alertSubject = replaceTemplateTags(
            (alertTpl as any)?.subject || `⚠️ Watched Customer Booking: {first_name} {last_name}`,
            alertTagsExt,
          );
          const alertBody = replaceTemplateTags(
            (alertTpl as any)?.html_content ||
              `<p style="font-family:Inter, Arial, sans-serif; color:#1F4C25; text-align:center;"><strong>{first_name} {last_name}</strong> ({email}) has just made a new booking.</p>`,
            alertTagsExt,
          );

          await resend.emails.send({
            from: "Birdies Bayside <info@birdiesbayside.com.au>",
            to: ["admin@birdiesbayside.com.au"],
            subject: alertSubject,
            html: buildEmailTemplate("Watched Customer Alert", alertBody),
          });
          logStep("Admin alert sent for flagged customer");
        }
      } catch (alertError: any) {
        logStep("Failed to send admin alert (non-blocking)", { error: alertError.message });
      }
    }


    // Send SMS for confirmations and reschedules (not cancellations)
    let smsResult: { success: boolean; response?: string; error?: string } = { success: false, error: "SMS not sent" };
    let gateSmsResult: { success: boolean; response?: string; error?: string } | null = null;
    
    if ((notification_type === "confirmation" || notification_type === "reschedule") && profile.phone) {
      // Send main booking SMS (skip silently if template was disabled in admin)
      if (smsMessage && smsMessage.trim().length > 0) {
        smsResult = await sendSMS(profile.phone, smsMessage);
        logStep("SMS send result", smsResult);
      } else {
        logStep("SMS template disabled or empty, skipping main SMS");
        smsResult = { success: false, error: "SMS template disabled" };
      }

      // Send second SMS for boom gate access if needed (only at dark hours)
      if (needsBoomGate && smsResult.success) {
        const gateMessage = await renderSmsTemplate("boom_gate_access");
        if (gateMessage && gateMessage.trim().length > 0) {
          gateSmsResult = await sendSMS(profile.phone, gateMessage);
          logStep("Gate SMS send result", gateSmsResult);
        } else {
          logStep("Boom gate SMS template disabled, skipping");
        }
      }

    } else if (notification_type === "cancellation" && profile.phone && smsMessage && smsMessage.trim().length > 0) {
      smsResult = await sendSMS(profile.phone, smsMessage);
      logStep("Cancellation SMS send result", smsResult);
    } else if (notification_type === "cancellation") {
      logStep("Cancellation SMS skipped (template disabled or no phone)");
    } else {
      logStep("No phone number, skipping SMS");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: true,
        sms_sent: smsResult.success,
        sms_error: smsResult.error || null,
        gate_sms_sent: gateSmsResult?.success || false,
        gate_sms_error: gateSmsResult?.error || null,
        message: `${notification_type} notification sent successfully` 
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
