import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IssueGiftCardRequest {
  gift_card_id: string;
  recipient_email: string;
  amount: number;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gift_card_id, recipient_email, amount }: IssueGiftCardRequest = await req.json();

    console.log(`[issue-gift-card] Issuing gift card for ${recipient_email}, amount: $${amount}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch email template
    const { data: template } = await supabase
      .from("email_templates")
      .select("subject, html_content")
      .eq("template_key", "gift_card_issued")
      .eq("is_active", true)
      .maybeSingle();

    // Clean link to the hub sign-up page (no token)
    const signupUrl = "https://hub.birdiesbayside.com.au";

    // Use template or fallback
    let subject = template?.subject || `You've received a $${amount.toFixed(2)} gift card!`;
    let htmlContent = template?.html_content || getDefaultTemplate(amount, signupUrl);

    // Replace placeholders
    subject = subject.replace(/\{amount\}/g, amount.toFixed(2));
    htmlContent = htmlContent
      .replace(/\{amount\}/g, amount.toFixed(2))
      .replace(/\{activation_url\}/g, signupUrl);

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Birdies Bayside <info@birdiesbayside.com.au>",
      to: [recipient_email],
      subject,
      html: htmlContent,
    });

    console.log(`[issue-gift-card] Email sent:`, emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailId: emailResponse.data?.id }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("[issue-gift-card] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});

function getDefaultTemplate(amount: number, signupUrl: string): string {
  return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Gift Card</title>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
          <tr>
            <td align="center" style="background-color:#1F4C25; padding:18px; border-radius:16px 16px 0 0;">
              <img src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603" width="140" alt="Birdies Bayside" style="display:block; width:140px; height:auto; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Arial, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">You've Received a Gift!</h1>
              <p style="margin:0 0 18px; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Great news! You've been gifted credit to use at Birdies Bayside.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
                <tr>
                  <td style="padding:30px; text-align:center;">
                    <p style="margin:0 0 8px; font-family:Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Gift Card Value</p>
                    <p style="margin:0; font-family:Arial, sans-serif; font-size:52px; font-weight:bold; color:#EC622D;">$${amount.toFixed(2)}</p>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0; font-family:Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Set up your free account to start using your credit for sessions at Birdies.</p>
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="${signupUrl}" style="display:inline-block; padding:14px 28px; font-family:Arial, sans-serif; font-size:18px; font-weight:bold; color:#FFFFFF; text-decoration:none;">Set Up Your Account</a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0; font-family:Arial, sans-serif; font-size:13px; line-height:1.5; color:#1F4C25; text-align:center; opacity:0.7;">Your credit will be automatically added once your account is set up using this email address.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <p style="margin:0; font-family:Arial, sans-serif; font-size:13px; color:#FFF5E4; text-align:center; opacity:0.85;">
                Birdies Bayside | <a href="mailto:info@birdiesbayside.com.au" style="color:#EC622D; text-decoration:none;">info@birdiesbayside.com.au</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
