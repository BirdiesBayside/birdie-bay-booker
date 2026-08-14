import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { Resend } from "npm:resend@2.0.0";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  gift_card_id: string;
  // Legacy params (still accepted, but we read the row directly)
  recipient_email?: string;
  amount?: number;
}

const SIGNUP_URL = "https://hub.birdiesbayside.com.au";
const HUB_ACCOUNT_URL = "https://hub.birdiesbayside.com.au/my-account";

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { gift_card_id } = (await req.json()) as Body;
    if (!gift_card_id) throw new Error("gift_card_id required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load the full card record
    const { data: card, error: cardErr } = await supabase
      .from("gift_cards")
      .select("*")
      .eq("id", gift_card_id)
      .single();

    if (cardErr || !card) throw new Error("Gift card not found");

    if (card.status === "redeemed" || card.status === "cancelled") {
      console.log(`[issue-gift-card] Card ${card.id} already ${card.status}, skipping`);
      return new Response(JSON.stringify({ success: true, skipped: card.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amount = Number(card.amount);
    const creditHours = Number(card.credit_hours || 0);
    const recipientEmail = String(card.recipient_email).toLowerCase().trim();
    const recipientName = card.recipient_name || "there";
    const senderName = card.sender_name || "A friend";
    const senderEmail = card.sender_email;
    const personalMessage = card.personal_message;
    const deliveryMethod = card.delivery_method || "email_recipient";
    const redemptionCode = card.redemption_code;

    console.log(
      `[issue-gift-card] Issuing card ${card.id} amount=$${amount} hours=${creditHours} method=${deliveryMethod} recipient=${recipientEmail}`
    );

    // Check if recipient already has a Birdies account
    const { data: recipientProfile } = await supabase
      .from("profiles")
      .select("user_id, first_name, deposit_balance, hour_credit_balance")
      .eq("email", recipientEmail)
      .maybeSingle();

    const recipientHasAccount = !!recipientProfile?.user_id;

    // If recipient has an account AND delivery includes them → auto-apply credit (hours preferred, then dollars)
    let autoApplied = false;
    if (recipientHasAccount && deliveryMethod !== "print_to_sender") {
      const updates: Record<string, number> = {};
      const hourBefore = Number(recipientProfile.hour_credit_balance ?? 0);
      const hourAfter = hourBefore + creditHours;
      if (creditHours > 0) updates.hour_credit_balance = hourAfter;

      const dollarBefore = Number(recipientProfile.deposit_balance ?? 0);
      const dollarAfter = dollarBefore + amount;
      if (amount > 0) updates.deposit_balance = dollarAfter;

      if (Object.keys(updates).length > 0) {
        await supabase
          .from("profiles")
          .update(updates)
          .eq("user_id", recipientProfile.user_id);
      }

      if (creditHours > 0) {
        await supabase.from("hour_credit_transactions").insert({
          user_id: recipientProfile.user_id,
          amount: creditHours,
          balance_before: hourBefore,
          balance_after: hourAfter,
          transaction_type: "gift_card",
          description: `Gift card from ${senderName} — ${creditHours} hour${creditHours === 1 ? "" : "s"}`,
          related_gift_card_id: card.id,
        });
      }

      if (amount > 0) {
        await supabase.from("deposit_transactions").insert({
          user_id: recipientProfile.user_id,
          amount,
          balance_before: dollarBefore,
          balance_after: dollarAfter,
          transaction_type: "gift_card",
          description: `Gift card from ${senderName}`,
          related_gift_card_id: card.id,
        });
      }

      await supabase
        .from("gift_cards")
        .update({
          status: "redeemed",
          redeemed_at: new Date().toISOString(),
          redeemed_by_user_id: recipientProfile.user_id,
          sent_at: new Date().toISOString(),
        })
        .eq("id", card.id);

      autoApplied = true;
      console.log(
        `[issue-gift-card] Auto-applied ${creditHours} hours + $${amount} to existing user ${recipientProfile.user_id}`
      );
    }

    const results: any[] = [];

    // ── Email to RECIPIENT ──
    if (deliveryMethod === "email_recipient" || deliveryMethod === "both") {
      const subject = autoApplied
        ? `${senderName} just gifted you $${amount.toFixed(2)} of Birdies credit!`
        : `${senderName} sent you a $${amount.toFixed(2)} Birdies gift!`;

      const heading = autoApplied ? "You've Been Gifted!" : "You've Been Gifted!";

      const messageBlock = personalMessage
        ? `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
          <tr>
            <td style="padding:18px 22px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25; font-style:italic;">
              "${escapeHtml(personalMessage)}"
              <div style="margin-top:10px; font-style:normal; font-size:13px; color:#1F4C25; opacity:0.7;">— ${escapeHtml(senderName)}</div>
            </td>
          </tr>
        </table>
        `
        : `<p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">From <strong>${escapeHtml(senderName)}</strong></p>`;

      const amountBlock = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:12px; margin:18px 0;">
          <tr>
            <td style="padding:30px; text-align:center;">
              <p style="margin:0 0 8px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#FFF5E4; opacity:0.9; letter-spacing:1px; text-transform:uppercase;">Gift Card Value</p>
              <p style="margin:0; font-family:Anton, Impact, Arial Black, sans-serif; font-size:56px; color:#EC622D;">$${amount.toFixed(2)}</p>
            </td>
          </tr>
        </table>
      `;

      const intro = autoApplied
        ? `<p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Hi ${escapeHtml(recipientName)}, great news — <strong>${escapeHtml(senderName)}</strong> has gifted you Birdies credit, and we've already added it to your account.</p>`
        : `<p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Hi ${escapeHtml(recipientName)}, <strong>${escapeHtml(senderName)}</strong> wants you to enjoy a session at Birdies Bayside on them.</p>`;

      const footer = autoApplied
        ? `<p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25; text-align:center;">Book a bay and your credit will apply automatically at checkout.</p>`
        : `<p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.6; color:#1F4C25; text-align:center;">Create your free account using <strong>this email address</strong> and your credit applies automatically.</p>`;

      const body = intro + messageBlock + amountBlock + footer;

      const html = await renderBrandedEmail(supabase, heading, body, {
        text: autoApplied ? "Book a Bay" : "Activate Your Gift",
        url: autoApplied ? "https://hub.birdiesbayside.com.au/booking" : SIGNUP_URL,
      });

      try {
        const r = await resend.emails.send({
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [recipientEmail],
          subject,
          html,
        });
        console.log(`[issue-gift-card] Recipient email sent:`, r);
        results.push({ to: "recipient", email_id: r.data?.id });
      } catch (e) {
        console.error(`[issue-gift-card] Recipient email failed:`, e);
        results.push({ to: "recipient", error: String(e) });
      }
    }

    // ── Printable email to SENDER ──
    if ((deliveryMethod === "print_to_sender" || deliveryMethod === "both") && senderEmail) {
      const subject = `Your printable gift card for ${recipientName} — $${amount.toFixed(2)}`;

      const printableCard = `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0;">
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFF5E4; border:3px dashed #1F4C25; border-radius:18px;">
                <tr>
                  <td style="padding:34px 28px; text-align:center;">
                    <p style="margin:0 0 6px; font-family:Inter, Arial, sans-serif; font-size:13px; color:#1F4C25; letter-spacing:2px; text-transform:uppercase; opacity:0.8;">Birdies Bayside Gift Card</p>
                    <p style="margin:0 0 18px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:64px; line-height:1; color:#EC622D;">$${amount.toFixed(2)}</p>
                    <p style="margin:0 0 6px; font-family:Inter, Arial, sans-serif; font-size:14px; color:#1F4C25; opacity:0.75;">To</p>
                    <p style="margin:0 0 18px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:28px; color:#1F4C25;">${escapeHtml(recipientName)}</p>
                    ${personalMessage ? `<p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:15px; line-height:1.5; color:#1F4C25; font-style:italic; padding:0 12px;">"${escapeHtml(personalMessage)}"</p>` : ""}
                    <p style="margin:0 0 4px; font-family:Inter, Arial, sans-serif; font-size:13px; color:#1F4C25; opacity:0.75;">From</p>
                    <p style="margin:0 0 22px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:22px; color:#1F4C25;">${escapeHtml(senderName)}</p>
                    <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="background-color:#1F4C25; border-radius:10px;">
                      <tr>
                        <td style="padding:12px 18px; text-align:center;">
                          <div style="font-family:Inter, Arial, sans-serif; font-size:11px; color:#FFF5E4; letter-spacing:1px; text-transform:uppercase; opacity:0.85;">Redemption Code</div>
                          <div style="font-family:'Courier New', monospace; font-size:22px; font-weight:bold; color:#FFF5E4; letter-spacing:2px; margin-top:4px;">${escapeHtml(redemptionCode || "")}</div>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:14px 0 0; font-family:Inter, Arial, sans-serif; font-size:11px; line-height:1.5; color:#1F4C25; opacity:0.8;">Create a free account at <strong>hub.birdiesbayside.com.au</strong><br/>then enter this code under <strong>My Account → Redeem Gift Card</strong></p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      `;

      const body = `
        <p style="margin:0 0 14px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">Your gift card is ready! Print this email (or just the card below) and give it to <strong>${escapeHtml(recipientName)}</strong>.</p>
        ${printableCard}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:22px 0 0; border:1px solid rgba(31,76,37,0.15);">
          <tr>
            <td style="padding:20px 22px;">
              <p style="margin:0 0 10px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; color:#1F4C25; text-align:center; letter-spacing:0.5px;">How ${escapeHtml(recipientName)} Redeems Their Gift</p>
              <ol style="margin:0; padding-left:22px; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.7; color:#1F4C25;">
                <li>Head to <a href="https://hub.birdiesbayside.com.au" style="color:#EC622D; text-decoration:underline;"><strong>hub.birdiesbayside.com.au</strong></a> and create a free account (or sign in).</li>
                <li>Go to <strong>My Account</strong> and find the <strong>"Redeem Gift Card"</strong> section.</li>
                <li>Enter the redemption code above — credit applies to their account instantly.</li>
                <li>Book a bay and the credit is automatically used at checkout.</li>
              </ol>
            </td>
          </tr>
        </table>
      `;

      const html = await renderBrandedEmail(supabase, "Your Printable Gift Card", body);

      try {
        const r = await resend.emails.send({
          from: "Birdies Bayside <info@birdiesbayside.com.au>",
          to: [senderEmail],
          subject,
          html,
        });
        console.log(`[issue-gift-card] Sender printable email sent:`, r);
        results.push({ to: "sender_printable", email_id: r.data?.id });
      } catch (e) {
        console.error(`[issue-gift-card] Sender printable email failed:`, e);
        results.push({ to: "sender_printable", error: String(e) });
      }
    }

    // If not auto-applied, mark status as pending (i.e. issued, awaiting redemption)
    if (!autoApplied) {
      await supabase
        .from("gift_cards")
        .update({ status: "pending", sent_at: new Date().toISOString() })
        .eq("id", card.id);
    }

    return new Response(
      JSON.stringify({ success: true, autoApplied, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[issue-gift-card] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
