import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { buildEmailTemplate, fetchEmailLayout } from "../_shared/email-wrapper.ts";

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

// Simple token generator for unsubscribe URL verification
async function generateUnsubscribeToken(email: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(email.toLowerCase() + "birdies-unsubscribe-salt");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, "0")).join("");
}

function buildUnsubscribeUrl(email: string, token: string): string {
  const rawUrl = Deno.env.get("SITE_URL") || "https://hub.birdiesbayside.com.au";
  const siteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, "") : `https://${rawUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
  return `${siteUrl}/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
}

// Places the unsubscribe link INSIDE the green footer block (last row of the
// footer's inner table) rather than appending a separate strip underneath.
function injectUnsubscribeIntoFooter(footerHtml: string, unsubscribeUrl: string): string {
  const linkRow = `
      <tr>
        <td align="center" style="padding-top:12px; font-family:Inter, Arial, sans-serif; font-size:11px; line-height:1.6; color:#FFFFFF;">
          <a href="${unsubscribeUrl}" style="color:#FFFFFF; text-decoration:underline; opacity:0.7;">Unsubscribe from marketing emails</a>
        </td>
      </tr>
`;
  const idx = footerHtml.lastIndexOf("</table>");
  if (idx === -1) {
    // Fallback: append inside the footer cell if no inner table found
    const cellIdx = footerHtml.lastIndexOf("</td>");
    if (cellIdx === -1) return footerHtml;
    return (
      footerHtml.slice(0, cellIdx) +
      `<div style="text-align:center; padding-top:12px; font-family:Inter, Arial, sans-serif; font-size:11px; color:#FFFFFF;"><a href="${unsubscribeUrl}" style="color:#FFFFFF; text-decoration:underline; opacity:0.7;">Unsubscribe from marketing emails</a></div>` +
      footerHtml.slice(cellIdx)
    );
  }
  return footerHtml.slice(0, idx) + linkRow + footerHtml.slice(idx);
}

interface MarketingEmailRequest {
  campaign_id: string;
  subject: string;
  html_content: string;
  recipients: Recipient[];
  is_test?: boolean;
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
    const rawUrl = Deno.env.get("SITE_URL") || "https://hub.birdiesbayside.com.au";
    const siteUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl.replace(/\/$/, "") : `https://${rawUrl.replace(/^\/+/, "").replace(/\/$/, "")}`;
    
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

// Background task to send all emails
async function sendEmailsInBackground(
  campaign_id: string,
  subject: string,
  html_content: string,
  recipients: Recipient[],
  is_test = false
) {
  console.log(`[BACKGROUND] Starting email send for campaign ${campaign_id} to ${recipients.length} recipients${is_test ? " (TEST — suppression bypassed)" : ""}`);

  
  // Check if the template contains {reset_link} - if so, we need to generate reset links
  const needsResetLink = html_content.includes('{reset_link}');
  console.log(`[BACKGROUND] Template needs reset links: ${needsResetLink}`);

  // Initialize Supabase admin client if we need to generate reset links
  let supabaseAdmin: any = null;
  if (needsResetLink) {
    supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );
  }

  // Also create admin client to update campaign status
  const supabaseForUpdate = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  // Global header/footer come from the shared email layout (Admin -> Notifications)
  const layout = await fetchEmailLayout(supabaseForUpdate);

  // --- Hard suppression: never send marketing to anyone who unsubscribed ---
  // Test sends bypass this so admins can always preview to their own address.
  if (is_test) {
    console.log("[BACKGROUND] Test send — suppression list not applied.");
  } else {
    try {
      const suppressed = new Set<string>();

      const { data: optedOut } = await supabaseForUpdate
        .from("profiles")
        .select("email")
        .eq("marketing_opt_out", true);
      (optedOut || []).forEach((p: any) => p?.email && suppressed.add(String(p.email).toLowerCase()));

      const { data: unsubLog } = await supabaseForUpdate
        .from("marketing_unsubscribes")
        .select("email");
      (unsubLog || []).forEach((u: any) => u?.email && suppressed.add(String(u.email).toLowerCase()));

      const before = recipients.length;
      recipients = recipients.filter((r) => !suppressed.has(String(r.email || "").toLowerCase()));
      console.log(
        `[BACKGROUND] Suppression list: ${suppressed.size} unsubscribed. Filtered ${before - recipients.length} recipient(s). Sending to ${recipients.length}.`,
      );
    } catch (err) {
      console.error("[BACKGROUND] Failed to load suppression list:", err);
    }
  }


  if (recipients.length === 0) {
    console.log("[BACKGROUND] No eligible recipients after suppression — nothing sent.");
  }

  let successCount = 0;
  let failCount = 0;

  // Process in larger batches for efficiency (Resend batch API supports up to 100 emails)
  const batchSize = 50;
  
  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    console.log(`[BACKGROUND] Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(recipients.length / batchSize)}`);
    
    // Prepare all emails in this batch
    const emailPromises = batch.map(async (recipient) => {
      try {
        // Generate reset link if needed
        let resetLink: string | undefined;
        if (needsResetLink && supabaseAdmin) {
          const link = await generateResetLink(supabaseAdmin, recipient.email);
          if (link) {
            resetLink = link;
          } else {
            // If we can't generate a reset link, use a fallback URL with forgot=true
            resetLink = "https://hub.birdiesbayside.com.au/?forgot=true";
            console.warn(`[BACKGROUND] Using fallback URL for ${recipient.email}`);
          }
        }

        const personalizedContent = replaceTemplateTags(html_content, recipient, resetLink);
        const personalizedSubject = replaceTemplateTags(subject, recipient);
        
        // Generate unsubscribe URL for this recipient
        const unsubscribeToken = await generateUnsubscribeToken(recipient.email);
        const unsubscribeUrl = buildUnsubscribeUrl(recipient.email, unsubscribeToken);
        
        // Wrap the marketing content in branded template
        const bodyContent = `
            <div style="font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25;">
              ${personalizedContent}
            </div>
        `;
        
        const footerWithUnsubscribe = injectUnsubscribeIntoFooter(layout.footer_html, unsubscribeUrl);

        // Subject is NOT rendered in the body — admins add their own heading in the HTML
        const brandedHtml = buildEmailTemplate("", bodyContent, undefined, {
          header_html: layout.header_html,
          footer_html: footerWithUnsubscribe,
        });

        return {
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [recipient.email],
          subject: personalizedSubject,
          html: brandedHtml,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        };
      } catch (error) {
        console.error(`[BACKGROUND] Error preparing email for ${recipient.email}:`, error);
        return null;
      }
    });

    const preparedEmails = (await Promise.all(emailPromises)).filter(e => e !== null);
    
    // Send each email individually (Resend batch API requires different format)
    for (const emailData of preparedEmails) {
      try {
        await resend.emails.send(emailData);
        successCount++;
      } catch (error) {
        failCount++;
        console.error(`[BACKGROUND] Failed to send to ${emailData.to}:`, error);
      }
    }
    
    console.log(`[BACKGROUND] Batch complete. Progress: ${successCount + failCount}/${recipients.length}`);
    
    // Small delay between batches to avoid rate limits
    if (i + batchSize < recipients.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log(`[BACKGROUND] Campaign ${campaign_id} completed. Success: ${successCount}, Failed: ${failCount}`);

  // Update campaign status in database (skipped for test sends with no campaign)
  if (!campaign_id) {
    console.log(`[BACKGROUND] Test send complete (no campaign record).`);
    return { successCount, failCount };
  }
  try {
    await supabaseForUpdate
      .from("marketing_campaigns")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        recipient_count: successCount,
      })
      .eq("id", campaign_id);
    console.log(`[BACKGROUND] Campaign status updated in database`);
  } catch (error) {
    console.error(`[BACKGROUND] Failed to update campaign status:`, error);
  }

  return { successCount, failCount };
}


const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaign_id, subject, html_content, recipients, is_test }: MarketingEmailRequest = await req.json();

    console.log(`[SEND-MARKETING-EMAIL] Starting campaign: ${campaign_id}${is_test ? " (test)" : ""}`);
    console.log(`[SEND-MARKETING-EMAIL] Recipients count: ${recipients.length}`);

    // Test sends run inline so the UI reports the real outcome
    // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
    if (!is_test && typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) {
      // @ts-ignore
      EdgeRuntime.waitUntil(sendEmailsInBackground(campaign_id, subject, html_content, recipients, false));
      

      
      console.log(`[SEND-MARKETING-EMAIL] Background task started, returning immediately`);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Sending ${recipients.length} emails in background`,
          queued: recipients.length
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } else {
      // Fallback for environments without EdgeRuntime.waitUntil
      console.log(`[SEND-MARKETING-EMAIL] EdgeRuntime.waitUntil not available, processing synchronously`);
      await sendEmailsInBackground(campaign_id, subject, html_content, recipients);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          sent: recipients.length
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  } catch (error: any) {
    console.error("[SEND-MARKETING-EMAIL] Error:", error);
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
