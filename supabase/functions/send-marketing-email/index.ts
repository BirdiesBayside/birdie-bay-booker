import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Recipient {
  email: string;
  first_name: string;
  last_name: string;
}

interface MarketingEmailRequest {
  campaign_id: string;
  subject: string;
  html_content: string;
  recipients: Recipient[];
}

// Replace template tags with actual values
function replaceTemplateTags(html: string, recipient: Recipient): string {
  return html
    .replace(/{first_name}/g, recipient.first_name || "there")
    .replace(/{last_name}/g, recipient.last_name || "")
    .replace(/{email}/g, recipient.email || "");
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaign_id, subject, html_content, recipients }: MarketingEmailRequest = await req.json();

    console.log(`Starting marketing email campaign: ${campaign_id}`);
    console.log(`Recipients count: ${recipients.length}`);

    let successCount = 0;
    let failCount = 0;

    // Send emails in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const promises = batch.map(async (recipient) => {
        try {
          const personalizedHtml = replaceTemplateTags(html_content, recipient);
          const personalizedSubject = replaceTemplateTags(subject, recipient);
          
          await resend.emails.send({
            from: "Birdies Hub <noreply@birdiesbayside.com.au>",
            to: [recipient.email],
            subject: personalizedSubject,
            html: personalizedHtml,
          });
          
          successCount++;
          console.log(`Email sent to: ${recipient.email}`);
        } catch (error) {
          failCount++;
          console.error(`Failed to send to ${recipient.email}:`, error);
        }
      });

      await Promise.all(promises);
      
      // Small delay between batches to avoid rate limits
      if (i + batchSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Campaign ${campaign_id} completed. Success: ${successCount}, Failed: ${failCount}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        sent: successCount, 
        failed: failCount 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-marketing-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);