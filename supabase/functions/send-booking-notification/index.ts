import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  booking_id: string;
  notification_type: "confirmation" | "cancellation";
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
      const period = hours >= 12 ? 'pm' : 'am';
      const hours12 = hours % 12 || 12;
      return `${hours12}:${minutes.toString().padStart(2, '0')}${period}`;
    };
    const startTime12hr = formatTime12hr(startTime);
    
    // Check if booking needs boom gate access (5-6am or 5pm onwards)
    const startHour = parseInt(booking.start_time.split(':')[0], 10);
    const needsBoomGate = (startHour >= 5 && startHour < 7) || startHour >= 17;

    // Email content based on notification type
    let subject: string;
    let htmlContent: string;
    let smsMessage: string;

    if (notification_type === "confirmation") {
      subject = "Booking Confirmed - Birdies Bayside";
      
      // Build SMS message matching SMS Broadcast template style (concise for SMS limits)
      const formattedSmsDate = new Date(booking.booking_date).toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
      
      let smsLines = [
        `Hi ${profile.first_name} ${profile.last_name} thank you for your booking on ${formattedSmsDate} at ${startTime12hr} for Bay ${bayNumber}`,
        ``,
        `Your door code is: 7675#`
      ];
      
      if (needsBoomGate) {
        smsLines.push(``);
        smsLines.push(`Gate app: birdiesbayside.com.au/gate`);
      }
      
      smsMessage = smsLines.join('\n');
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #1f4c25; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff5e4; margin: 0;">Booking Confirmed!</h1>
          </div>
          <div style="background-color: #fff5e4; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Hi ${profile.first_name},</p>
            <p>Your golf simulator booking has been confirmed. Here are your booking details:</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ec622d;">
              <p style="margin: 5px 0;"><strong>Date:</strong> ${bookingDate}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
              <p style="margin: 5px 0;"><strong>Duration:</strong> ${booking.duration_hours} hour${booking.duration_hours > 1 ? "s" : ""}</p>
              <p style="margin: 5px 0;"><strong>Bay:</strong> ${bayName}</p>
              <p style="margin: 5px 0;"><strong>Players:</strong> ${booking.player_count}</p>
              <p style="margin: 5px 0;"><strong>Total:</strong> $${booking.total_price.toFixed(2)}</p>
            </div>
            
            <div style="background-color: #1f4c25; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #fff5e4; margin: 0 0 10px 0; font-size: 16px;"><strong>Door Access Code:</strong> 7675#</p>
              ${needsBoomGate ? `
              <p style="color: #fff5e4; margin: 0; font-size: 14px;">
                <strong>IMPORTANT:</strong> You will require Boom gate access for your booking time, 
                <a href="https://birdiesbayside.com.au/pages/birdies-gate-access" style="color: #ec622d;">download the app here</a>
              </p>
              ` : ''}
            </div>
            
            <p>We look forward to seeing you at Birdies Bayside!</p>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you need to make changes to your booking, please log in to your account or contact us.
            </p>
          </div>
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>Birdies Bayside Golf Simulators</p>
            <p>info@birdiesbayside.com.au</p>
          </div>
        </body>
        </html>
      `;
    } else {
      subject = "Booking Cancelled - Birdies Bayside";
      smsMessage = `Birdies Bayside: Your booking for ${shortDate} ${startTime}-${endTime} has been cancelled. Questions? Contact us.`;
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #1f4c25; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff5e4; margin: 0;">Booking Cancelled</h1>
          </div>
          <div style="background-color: #fff5e4; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Hi ${profile.first_name},</p>
            <p>Your booking has been cancelled. Here were the booking details:</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #666;">
              <p style="margin: 5px 0;"><strong>Date:</strong> ${bookingDate}</p>
              <p style="margin: 5px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
              <p style="margin: 5px 0;"><strong>Bay:</strong> ${bayName}</p>
            </div>
            
            <p>If you didn't request this cancellation or need assistance, please contact us.</p>
            
            <p style="margin-top: 20px;">We hope to see you again soon at Birdies Bayside!</p>
          </div>
          <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
            <p>Birdies Bayside Golf Simulators</p>
            <p>info@birdiesbayside.com.au</p>
          </div>
        </body>
        </html>
      `;
    }

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Birdies Bayside <info@birdiesbayside.com.au>",
      to: [profile.email],
      subject: subject,
      html: htmlContent,
    });

    logStep("Email sent successfully", { emailResponse });

    // Send SMS if phone number exists
    let smsResult: { success: boolean; response?: string; error?: string } = { success: false, error: "No phone number" };
    if (profile.phone) {
      smsResult = await sendSMS(profile.phone, smsMessage);
      logStep("SMS send result", smsResult);
    } else {
      logStep("No phone number, skipping SMS");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: true,
        sms_sent: smsResult.success,
        sms_error: smsResult.error || null,
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
