import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DepositNotificationRequest {
  user_id: string;
  amount: number;
  new_balance: number;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-DEPOSIT-NOTIFICATION] ${step}${detailsStr}`);
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

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { user_id, amount, new_balance }: DepositNotificationRequest = await req.json();
    logStep("Request received", { user_id, amount, new_balance });

    if (!user_id || amount === undefined || new_balance === undefined) {
      throw new Error("Missing user_id, amount, or new_balance");
    }

    // Fetch user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (profileError || !profile) {
      throw new Error(`Failed to fetch profile: ${profileError?.message}`);
    }
    logStep("Profile fetched", { email: profile.email, phone: profile.phone });

    // Fetch custom email template
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", "credit_added")
      .single();
    
    if (templateError) {
      logStep("Template fetch error (using default)", { error: templateError.message });
    } else {
      logStep("Template fetched", { hasCustomHtml: !!emailTemplate?.html_content });
    }

    // Calculate previous balance
    const previousBalance = new_balance - amount;

    // Template replacement tags
    const templateTags: Record<string, string> = {
      '{first_name}': profile.first_name || '',
      '{last_name}': profile.last_name || '',
      '{email}': profile.email || '',
      '{deposit_amount}': `$${amount.toFixed(2)}`,
      '{new_balance}': `$${new_balance.toFixed(2)}`,
      '{previous_balance}': `$${previousBalance.toFixed(2)}`,
    };

    // Use custom subject if available
    let subject = emailTemplate?.subject || "Credit Added to Your Account - Birdies Bayside";
    let htmlContent: string;

    if (emailTemplate?.html_content) {
      htmlContent = replaceTemplateTags(emailTemplate.html_content, templateTags);
      subject = replaceTemplateTags(subject, templateTags);
      logStep("Using custom email template");
    } else {
      // Default template
      htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #1f4c25; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="color: #fff5e4; margin: 0;">Credit Added!</h1>
          </div>
          <div style="background-color: #fff5e4; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Hi ${profile.first_name},</p>
            <p>Great news! Credit has been added to your Birdies Bayside account.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ec622d; text-align: center;">
              <p style="margin: 5px 0; font-size: 18px;"><strong>Amount Added:</strong></p>
              <p style="margin: 5px 0; font-size: 32px; color: #1f4c25;"><strong>$${amount.toFixed(2)}</strong></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;">
              <p style="margin: 5px 0; font-size: 16px;"><strong>New Balance:</strong> $${new_balance.toFixed(2)}</p>
            </div>
            
            <p>You can use your credit balance when booking a bay - just select "Use Balance" at checkout!</p>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you have any questions, please contact us.
            </p>
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

    // Credit notifications are email only (no SMS per business rules)
    logStep("Credit notification - email only, skipping SMS");

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: true,
        sms_sent: false,
        message: "Deposit notification sent successfully" 
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
