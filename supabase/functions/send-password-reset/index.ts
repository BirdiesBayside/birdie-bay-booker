import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

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

    // Generate a password recovery link using the auth admin API.
    // We email a safe app URL carrying the token hash instead of the one-time verify link,
    // which helps avoid mail scanners burning the token before the customer clicks it.
    const rawSiteUrl = Deno.env.get("SITE_URL") || "https://hub.birdiesbayside.com.au";
    const siteUrl = /^https?:\/\//i.test(rawSiteUrl) ? rawSiteUrl.replace(/\/$/, "") : `https://${rawSiteUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
    const redirectDestination = new URL((redirectUrl || "/reset-password").trim() || "/reset-password", `${siteUrl}/`);
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectDestination.toString(),
      },
    });

    if (linkError) {
      logStep("Error generating link", { error: linkError.message });
      throw linkError;
    }

    logStep("Link generated successfully");

    const resetUrl = new URL(redirectDestination.toString());
    resetUrl.searchParams.set("token_hash", linkData.properties.hashed_token);
    resetUrl.searchParams.set("type", "recovery");

    const resetLink = resetUrl.toString();
    const name = firstName || "there";

    // Build branded email matching other Birdies emails
    const bodyContent = `
              <p style="font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#333333; margin:0 0 16px;">
                Hi ${name}!
              </p>
              <p style="font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#333333; margin:0 0 16px;">
                You've been invited to set up your password for your Birdies account, or you requested a password reset.
              </p>
              <p style="font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#333333; margin:0 0 6px;">
                Click the button below to set your password:
              </p>
    `;

    const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Set Your Birdies Password</title>
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
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                Set Your Password
              </h1>
              ${bodyContent}
              <!-- BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="${resetLink}"
                       style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      Set Password
                    </a>
                  </td>
                </tr>
              </table>
              <p style="font-family:Inter, Arial, sans-serif; font-size:13px; line-height:1.5; color:#999999; margin:24px 0 0; text-align:center;">
                This link will expire in 24 hours. If you didn't request this email, you can safely ignore it.
              </p>
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

    // Send email via Resend
    const emailResponse = await resend.emails.send({
      from: "Birdies <info@birdiesbayside.com.au>",
      to: [email],
      subject: "Set Your Birdies Password",
      html: htmlContent,
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
