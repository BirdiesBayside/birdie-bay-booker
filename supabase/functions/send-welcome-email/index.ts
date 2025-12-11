import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-WELCOME-EMAIL] ${step}${detailsStr}`);
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

    const { user_id, email, first_name, last_name }: WelcomeEmailRequest = await req.json();
    logStep("Request received", { user_id, email, first_name });

    if (!email || !first_name) {
      throw new Error("Missing email or first_name");
    }

    // Fetch custom email template
    const { data: emailTemplate, error: templateError } = await supabaseClient
      .from("email_templates")
      .select("*")
      .eq("template_key", "welcome")
      .eq("is_active", true)
      .single();
    
    if (templateError) {
      logStep("Template fetch error (using default)", { error: templateError.message });
    } else {
      logStep("Template fetched", { hasCustomHtml: !!emailTemplate?.html_content });
    }

    // Template replacement tags
    const templateTags: Record<string, string> = {
      '{first_name}': first_name || '',
      '{last_name}': last_name || '',
      '{email}': email || '',
    };

    // Use custom subject if available
    let subject = emailTemplate?.subject || "Welcome to Birdies!";
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
            <h1 style="color: #fff5e4; margin: 0;">Welcome to Birdies!</h1>
          </div>
          <div style="background-color: #fff5e4; padding: 30px; border-radius: 0 0 8px 8px;">
            <p>Hi ${first_name},</p>
            <p>Welcome to Birdies Bayside! We're excited to have you join our community of golf enthusiasts.</p>
            
            <p>Your account has been created and you're ready to start booking sessions on our state-of-the-art golf simulators.</p>
            
            <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ec622d;">
              <h3 style="margin: 0 0 10px 0; color: #1f4c25;">What's Next?</h3>
              <ul style="margin: 0; padding-left: 20px;">
                <li>Book your first session</li>
                <li>Explore our membership options for discounted rates</li>
                <li>Join the Birdies League to compete with other members</li>
              </ul>
            </div>
            
            <p>If you have any questions, don't hesitate to reach out to us.</p>
            
            <p>See you on the course!</p>
            <p><strong>The Birdies Team</strong></p>
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
      to: [email],
      subject: subject,
      html: htmlContent,
    });

    logStep("Email sent successfully", { emailResponse });

    return new Response(
      JSON.stringify({ 
        success: true, 
        email_sent: true,
        message: "Welcome email sent successfully" 
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
