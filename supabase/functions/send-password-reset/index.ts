import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-PASSWORD-RESET] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

    const { email, firstName, redirectUrl } = await req.json();
    
    if (!email) {
      throw new Error("Email is required");
    }

    logStep("Generating password reset link", { email });

    // Generate a password recovery link using Supabase Admin API
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectUrl || `${req.headers.get("origin")}/reset-password`,
      },
    });

    if (linkError) {
      logStep("Error generating link", { error: linkError.message });
      throw linkError;
    }

    logStep("Link generated successfully");

    // The action link from Supabase
    const resetLink = linkData.properties.action_link;
    const name = firstName || "there";

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "Birdies <info@birdiesbayside.com.au>",
      to: [email],
      subject: "Set Your Birdies Password",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1f4c25; margin: 0; font-size: 28px;">BIRDIES</h1>
          </div>
          
          <h2 style="color: #1f4c25; margin-bottom: 20px;">Hi ${name}!</h2>
          
          <p style="margin-bottom: 20px;">
            You've been invited to set up your password for your Birdies account, or you requested a password reset.
          </p>
          
          <p style="margin-bottom: 30px;">
            Click the button below to set your password:
          </p>
          
          <div style="text-align: center; margin-bottom: 30px;">
            <a href="${resetLink}" 
               style="background-color: #ec622d; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: bold;
                      display: inline-block;">
              Set Password
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="word-break: break-all; color: #ec622d; font-size: 14px; margin-bottom: 30px;">
            ${resetLink}
          </p>
          
          <p style="color: #666; font-size: 14px;">
            This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            © ${new Date().getFullYear()} Birdies Bayside. All rights reserved.
          </p>
        </body>
        </html>
      `,
    });

    logStep("Email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Password reset email sent" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
