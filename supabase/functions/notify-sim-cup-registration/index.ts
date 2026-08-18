const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { name, email, phone, shirt_size } = await req.json();
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("Missing RESEND_API_KEY");

    if (!name || !email) {
      return new Response(JSON.stringify({ error: "name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safe = (s: unknown) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const row = (label: string, value: unknown) =>
      `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;color:#1F4C25;width:160px;">${label}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#222;">${safe(value) || "—"}</td></tr>`;

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#FFF5E4;">
        <div style="background:#1F4C25;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0;">
          <h2 style="margin:0;font-size:20px;">New Sim Cup Registration</h2>
        </div>
        <div style="background:#fff;padding:18px 22px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            ${row("Name", name)}
            ${row("Email", email)}
            ${row("Phone", phone)}
            ${row("Shirt size", shirt_size)}
            ${row("Received", new Date().toLocaleString("en-AU", { timeZone: "Australia/Brisbane" }))}
          </table>
        </div>
      </div>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Birdies Bayside <noreply@birdiesbayside.com.au>",
        to: ["info@birdiesbayside.com.au"],
        reply_to: email,
        subject: `Sim Cup Registration — ${name}`,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Resend error:", err);
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
