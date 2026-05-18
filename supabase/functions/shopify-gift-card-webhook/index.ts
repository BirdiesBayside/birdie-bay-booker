import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic, x-shopify-shop-domain",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Verify Shopify HMAC signature
async function verifyShopifyHmac(rawBody: string, hmacHeader: string, secret: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const computed = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return computed === hmacHeader;
}

// Read a line-item property by name (Shopify normalizes to underscore-prefixed for hidden)
function getProp(props: Array<{ name: string; value: string }> | undefined, ...names: string[]): string | null {
  if (!props) return null;
  for (const n of names) {
    const found = props.find((p) => p.name?.toLowerCase().trim() === n.toLowerCase().trim());
    if (found && found.value) return String(found.value).trim();
  }
  return null;
}

function brisbaneToday(): string {
  // YYYY-MM-DD in Australia/Brisbane (UTC+10, no DST)
  const now = new Date();
  const bris = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return bris.toISOString().slice(0, 10);
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  const rawBody = await req.text();
  const hmac = req.headers.get("x-shopify-hmac-sha256") || "";
  const topic = req.headers.get("x-shopify-topic") || "";
  const shopDomain = req.headers.get("x-shopify-shop-domain") || "";

  const webhookSecret = Deno.env.get("SHOPIFY_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[shopify-webhook] SHOPIFY_WEBHOOK_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server not configured" }), { status: 500, headers: corsHeaders });
  }

  // Verify HMAC
  const valid = await verifyShopifyHmac(rawBody, hmac, webhookSecret);
  if (!valid) {
    console.warn("[shopify-webhook] Invalid HMAC signature from", shopDomain);
    return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 401, headers: corsHeaders });
  }

  let order: any;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: corsHeaders });
  }

  console.log(`[shopify-webhook] Topic: ${topic}, Order: ${order?.name || order?.id}, Shop: ${shopDomain}`);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const orderId = String(order.id);
  const orderNumber = order.name || order.order_number?.toString() || orderId;
  const buyerEmail = order.email || order.contact_email || null;
  const buyerName = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ").trim() || null;

  const results: any[] = [];
  const today = brisbaneToday();

  for (const item of order.line_items || []) {
    const props = item.properties || [];
    const recipientEmail = getProp(props, "Recipient Email", "_recipient_email", "recipient_email");
    const recipientName = getProp(props, "Recipient Name", "_recipient_name", "recipient_name");
    const message = getProp(props, "Personal Message", "Message", "_message", "message");
    const deliveryDateRaw = getProp(props, "Delivery Date", "_delivery_date", "delivery_date");
    const sendToMe = getProp(props, "Send to me instead", "_send_to_me", "send_to_me");

    // Only process if there's recipient info or this is a gift card variant
    // Determine amount from variant price (Shopify gift card products)
    const amount = parseFloat(item.price || "0") * (item.quantity || 1);
    if (!amount || amount <= 0) {
      console.log(`[shopify-webhook] Skipping line item ${item.id} - no amount`);
      continue;
    }

    // If no recipient email and not flagged as gift card, skip (likely not a gift card product)
    if (!recipientEmail && !sendToMe) {
      console.log(`[shopify-webhook] Skipping line item ${item.id} - no recipient and not send-to-me`);
      continue;
    }

    const sendToBuyer = sendToMe?.toLowerCase() === "yes" || sendToMe?.toLowerCase() === "true";
    const finalRecipientEmail = (sendToBuyer ? buyerEmail : recipientEmail) || buyerEmail;
    if (!finalRecipientEmail) {
      console.warn(`[shopify-webhook] Line item ${item.id} has no usable email`);
      continue;
    }

    // Parse delivery date — accept YYYY-MM-DD or natural date strings
    let scheduledFor: string | null = null;
    if (deliveryDateRaw) {
      const parsed = new Date(deliveryDateRaw);
      if (!isNaN(parsed.getTime())) {
        scheduledFor = parsed.toISOString().slice(0, 10);
      }
    }

    const isFuture = scheduledFor && scheduledFor > today;
    const status = isFuture ? "scheduled" : "pending";

    // Idempotent insert (unique on shopify_order_id + shopify_line_item_id)
    const { data: existing } = await supabase
      .from("gift_cards")
      .select("id, status")
      .eq("shopify_order_id", orderId)
      .eq("shopify_line_item_id", String(item.id))
      .maybeSingle();

    if (existing) {
      console.log(`[shopify-webhook] Gift card already exists for line ${item.id}: ${existing.id}`);
      results.push({ line_item_id: item.id, skipped: "duplicate", gift_card_id: existing.id });
      continue;
    }

    const { data: inserted, error: insertErr } = await supabase
      .from("gift_cards")
      .insert({
        recipient_email: finalRecipientEmail.toLowerCase().trim(),
        amount,
        status,
        source: "shopify",
        shopify_order_id: orderId,
        shopify_line_item_id: String(item.id),
        shopify_order_number: orderNumber,
        recipient_name: sendToBuyer ? buyerName : recipientName,
        sender_name: buyerName,
        sender_email: buyerEmail,
        personal_message: message,
        scheduled_for: scheduledFor,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error(`[shopify-webhook] Insert failed for line ${item.id}:`, insertErr);
      results.push({ line_item_id: item.id, error: insertErr.message });
      continue;
    }

    console.log(`[shopify-webhook] Created gift card ${inserted.id} status=${status} for ${finalRecipientEmail}`);

    // Send immediately if not scheduled
    if (!isFuture) {
      try {
        const { error: sendErr } = await supabase.functions.invoke("issue-gift-card", {
          body: {
            gift_card_id: inserted.id,
            recipient_email: finalRecipientEmail,
            amount,
          },
        });
        if (sendErr) {
          console.error(`[shopify-webhook] issue-gift-card failed:`, sendErr);
        } else {
          await supabase
            .from("gift_cards")
            .update({ status: "pending", sent_at: new Date().toISOString() })
            .eq("id", inserted.id);
        }
      } catch (e) {
        console.error(`[shopify-webhook] Send error:`, e);
      }
    }

    results.push({ line_item_id: item.id, gift_card_id: inserted.id, status, scheduled_for: scheduledFor });
  }

  return new Response(
    JSON.stringify({ success: true, order: orderNumber, processed: results }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
