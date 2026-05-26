import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { buildEmailTemplate } from "../_shared/email-wrapper.ts";

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

    // Use template body or default body
    let subject = template?.subject || `You've received a $${amount.toFixed(2)} gift card!`;
    let bodyContent = template?.html_content || getDefaultBody(amount);

    // Replace placeholders
    subject = subject.replace(/\{amount\}/g, amount.toFixed(2));
    bodyContent = bodyContent
      .replace(/\{amount\}/g, amount.toFixed(2))
      .replace(/\{activation_url\}/g, signupUrl);

    // Wrap with branded header/footer
    const htmlContent = buildEmailTemplate(
      "You've Received a Gift!",
      bodyContent,
      { text: "Set Up Your Account", url: signupUrl }
    );

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

function getDefaultBody(amount: number): string {
  return `
    <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Great news! You've been gifted credit to use at Birdies Bayside.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
      <tr>
        <td style="padding:30px; text-align:center;">
          <p style="margin:0 0 8px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9;">Gift Card Value</p>
          <p style="margin:0; font-family:Anton, Impact, Arial Black, sans-serif; font-size:52px; color:#EC622D;">$${amount.toFixed(2)}</p>
        </td>
      </tr>
    </table>
    <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Click the button below to activate your account and start using your credit for booking simulator sessions.</p>
  `;
}
