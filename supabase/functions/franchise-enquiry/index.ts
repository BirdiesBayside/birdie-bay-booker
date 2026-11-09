import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.25.76";
import { renderBrandedEmail } from "../_shared/email-wrapper.ts";

const schema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(6).max(30).regex(/^[+\d\s().-]+$/),
  region: z.string().trim().min(1).max(100),
  location: z.string().trim().min(1).max(200),
  budget: z.enum(["$250k – $300k", "$300k - $500k", "$500k - $1M", "Over $1M"]),
  comments: z.string().trim().max(2000).optional().default(""),
});
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char));
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return reply({ error: "Please check your enquiry details", fields: parsed.error.flatten().fieldErrors }, 400);
    const client = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: row, error } = await client.from("franchise_enquiries").insert(parsed.data).select("id").single();
    if (error || !row) throw new Error("Your enquiry could not be saved. Please try again.");
    let emailSent = false;
    try {
      const key = Deno.env.get("RESEND_API_KEY");
      if (!key) throw new Error("Email sending is unavailable");
      const labels: Record<string, string> = { name: "Name", email: "Email", phone: "Phone", region: "State / Region", location: "Desired Franchise Location", budget: "Investment budget", comments: "Comments" };
      const body = Object.entries(parsed.data).map(([field, value]) => `<p style="white-space:pre-wrap"><strong>${labels[field]}:</strong> ${escapeHtml(value)}</p>`).join("");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `franchise-enquiry-${row.id}` },
        body: JSON.stringify({ from: "Birdies Bayside <info@birdiesbayside.com.au>", to: ["franchising@birdiesbayside.com.au"], reply_to: parsed.data.email, subject: `Franchise enquiry: ${parsed.data.location}`, html: await renderBrandedEmail(client, "New franchise enquiry", body), text: Object.entries(parsed.data).map(([field, value]) => `${labels[field]}: ${value}`).join("\n") }),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
      const result = await response.json();
      const { error: updateError } = await client.from("franchise_enquiries").update({ email_status: "sent", email_message_id: result.id }).eq("id", row.id);
      if (updateError) console.error("Franchise email status update failed", updateError.code);
      emailSent = true;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Email sending failed";
      const { error: updateError } = await client.from("franchise_enquiries").update({ email_status: "failed", email_error: message }).eq("id", row.id);
      if (updateError) console.error("Franchise email failure status update failed", updateError.code);
    }
    return reply({ success: true, id: row.id, email_sent: emailSent });
  } catch (error) {
    return reply({ error: error instanceof Error ? error.message : "Unable to submit enquiry" }, 500);
  }
});