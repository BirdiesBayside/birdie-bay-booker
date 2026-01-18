import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

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
function replaceTemplateTags(html: string, recipient: Recipient, resetLink?: string): string {
  let result = html
    .replace(/{first_name}/g, recipient.first_name || "there")
    .replace(/{last_name}/g, recipient.last_name || "")
    .replace(/{email}/g, recipient.email || "");
  
  // Replace reset_link if provided
  if (resetLink) {
    result = result.replace(/{reset_link}/g, resetLink);
  }
  
  return result;
}

// Generate password reset link for a user
async function generateResetLink(supabaseAdmin: any, email: string): Promise<string | null> {
  try {
    const siteUrl = Deno.env.get("SITE_URL") || "https://hub.birdiesbayside.com.au";
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    if (linkError) {
      console.error(`Error generating reset link for ${email}:`, linkError.message);
      return null;
    }

    return linkData.properties.action_link;
  } catch (error) {
    console.error(`Exception generating reset link for ${email}:`, error);
    return null;
  }
}

// Build branded email wrapper
const buildEmailTemplate = (heading: string, bodyContent: string, ctaButton?: { text: string; url: string }) => {
  const buttonHtml = ctaButton ? `
              <!-- BUTTON -->
              <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
                <tr>
                  <td bgcolor="#EC622D" style="border-radius:12px;">
                    <a href="${ctaButton.url}"
                       style="display:inline-block; padding:14px 24px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; letter-spacing:0.3px; color:#FFFFFF; text-decoration:none;">
                      ${ctaButton.text}
                    </a>
                  </td>
                </tr>
              </table>
  ` : '';

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
        <!-- CONTAINER -->
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
                ${heading}
              </h1>
              ${bodyContent}
              ${buttonHtml}
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <!-- SOCIAL ICONS -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding-bottom:14px;">
                    <!-- Instagram -->
                    <a href="https://www.instagram.com/birdiesbayside" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174855.png" alt="Instagram" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                    <!-- Facebook -->
                    <a href="https://www.facebook.com/share/17NifCh2vH/" style="margin:0 8px; text-decoration:none;">
                      <img src="https://cdn-icons-png.flaticon.com/512/174/174848.png" alt="Facebook" width="28" height="28" style="display:inline-block; border:0;" />
                    </a>
                  </td>
                </tr>
                <!-- CONTACT DETAILS -->
                <tr>
                  <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#FFFFFF;">
                    <div>Unit 2, 86 Jardine Drive, Redland Bay QLD 4165</div>
                    <div><a href="tel:+61422048604" style="color:#FFFFFF; text-decoration:underline;">0422 048 604</a></div>
                    <div><a href="https://birdiesbayside.com.au" style="color:#FFFFFF; text-decoration:underline;">birdiesbayside.com.au</a></div>
                    <div style="margin-top:10px; font-size:12px; opacity:0.75;">© Birdies Bayside</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- /CONTAINER -->
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaign_id, subject, html_content, recipients }: MarketingEmailRequest = await req.json();

    console.log(`Starting marketing email campaign: ${campaign_id}`);
    console.log(`Recipients count: ${recipients.length}`);

    // Check if the template contains {reset_link} - if so, we need to generate reset links
    const needsResetLink = html_content.includes('{reset_link}');
    console.log(`Template needs reset links: ${needsResetLink}`);

    // Initialize Supabase admin client if we need to generate reset links
    let supabaseAdmin: any = null;
    if (needsResetLink) {
      supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
        { auth: { persistSession: false } }
      );
    }

    let successCount = 0;
    let failCount = 0;

    // Send emails in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      
      const promises = batch.map(async (recipient) => {
        try {
          // Generate reset link if needed
          let resetLink: string | undefined;
          if (needsResetLink && supabaseAdmin) {
            const link = await generateResetLink(supabaseAdmin, recipient.email);
            if (link) {
              resetLink = link;
            } else {
              // If we can't generate a reset link, use a fallback URL
              resetLink = "https://hub.birdiesbayside.com.au";
              console.warn(`Using fallback URL for ${recipient.email} - reset link generation failed`);
            }
          }

          const personalizedContent = replaceTemplateTags(html_content, recipient, resetLink);
          const personalizedSubject = replaceTemplateTags(subject, recipient);
          
          // Wrap the marketing content in branded template
          const bodyContent = `
              <div style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
                ${personalizedContent}
              </div>
          `;
          
          const brandedHtml = buildEmailTemplate(personalizedSubject, bodyContent, {
            text: "Book Now",
            url: "https://hub.birdiesbayside.com.au/booking"
          });
          
          await resend.emails.send({
            from: "Birdies Bayside <info@birdiesbayside.com.au>",
            to: [recipient.email],
            subject: personalizedSubject,
            html: brandedHtml,
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
