import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BulkEmailRequest {
  to: string;
  subject: string;
  html: string;
}

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[SEND-BULK-EMAIL] ${step}${detailsStr}`);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const { to, subject, html }: BulkEmailRequest = await req.json();
    logStep("Request received", { to, subject: subject.substring(0, 50) });

    if (!to || !subject || !html) {
      throw new Error("Missing to, subject, or html");
    }

    // Wrap the custom HTML content in branded template
    // The html content becomes the body, subject becomes heading
    const bodyContent = `
              <div style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
                ${html}
              </div>
    `;
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const brandedHtml = await renderBrandedEmail(supabase, subject, bodyContent, {
      text: "Visit Birdies",
      url: "https://birdiesbayside.com.au"
    });

    // Send email
    const emailResponse = await resend.emails.send({
      from: "Birdies Bayside <info@birdiesbayside.com.au>",
      to: [to],
      subject: subject,
      html: brandedHtml,
    });

    logStep("Email sent successfully", { emailResponse });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Email sent successfully" 
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