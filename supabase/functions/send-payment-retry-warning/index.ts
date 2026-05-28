import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentRetryRequest {
  email: string;
  first_name: string;
  amount?: number; // in dollars
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[SEND-PAYMENT-RETRY-WARNING] ${step}${detailsStr}`);
};

const buildTemplate = (firstName: string, amount?: number) => {
  const amountLine = amount
    ? `<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">We tried to charge <strong>$${amount.toFixed(2)}</strong> for your weekly Birdies membership and the payment didn't go through.</p>`
    : `<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">We tried to charge your card for your weekly Birdies membership and the payment didn't go through.</p>`;

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
              <img src="https://cdn.shopify.com/s/files/1/0758/7030/6550/files/NO-BG_BIRDIES-LOGOS_WORK-DOC_AMENDED-9.7.25-01.png?v=1761536603" width="140" alt="Birdies Bayside" style="display:block; width:140px; height:auto; border:0;" />
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">Heads Up — Payment Didn't Clear</h1>
              <p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Hi ${firstName},</p>
              ${amountLine}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FEF3C7; border-radius:12px; margin:18px 0; border-left:4px solid #D97706;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#92400E;">
                    <h3 style="margin:0 0 10px 0; font-family:Anton, Impact, Arial Black, sans-serif; color:#92400E;">We'll Try Again Soon</h3>
                    <p style="margin:0;">No action needed — just make sure funds are available in the account linked to your card and we'll automatically retry the payment shortly.</p>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 8px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25; text-align:center;">If you'd like to change the card on file instead, you can update it here:</p>
              <p style="margin:0 0 4px; text-align:center;">
                <a href="https://hub.birdiesbayside.com.au/my-account" style="display:inline-block; background-color:#EC622D; color:#FFFFFF; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; padding:12px 28px; border-radius:8px; text-decoration:none; letter-spacing:0.5px;">Update Card</a>
              </p>

              <p style="margin:24px 0 0; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.6; color:#1F4C25; text-align:center; opacity:0.8;">If the second attempt also fails, your membership will be cancelled and you'll drop back to visitor pricing — but you can re-subscribe any time.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" /></a>
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;"><img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" /></a>
                  </td>
                </tr>
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
    const { email, first_name, amount }: PaymentRetryRequest = await req.json();
    logStep("Request received", { email, first_name, amount });

    if (!email) throw new Error("Missing email");

    const html = buildTemplate(first_name || "there", amount);

    const emailResponse = await resend.emails.send({
      from: "Birdies Bayside <info@birdiesbayside.com.au>",
      to: [email],
      subject: "Heads up — your Birdies payment didn't clear",
      html,
    });

    logStep("Email sent", { emailResponse });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    logStep("ERROR", { message: error.message });
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
