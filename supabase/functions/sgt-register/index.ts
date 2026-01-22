import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Build branded email for new member notification
function buildNewMemberEmail(data: { username: string; email: string; sgtUserId: number; registeredAt: string }): string {
  const registrationDate = new Date(data.registeredAt).toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    dateStyle: "full",
    timeStyle: "short",
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>New League Member</title>
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
                🎉 New League Member!
              </h1>
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                A new member has joined the Birdies League via the app.
              </p>
              
              <!-- MEMBER DETAILS BOX -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
                    <h3 style="margin:0 0 16px 0; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25;">Member Details</h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;">
                          <strong>Username:</strong>
                        </td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">
                          ${data.username}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;">
                          <strong>Email:</strong>
                        </td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">
                          <a href="mailto:${data.email}" style="color:#1F4C25;">${data.email}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;">
                          <strong>SGT User ID:</strong>
                        </td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">
                          ${data.sgtUserId}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;">
                          <strong>Registered:</strong>
                        </td>
                        <td style="padding:8px 0; text-align:right;">
                          ${registrationDate}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.6; color:#666; text-align:center;">
                This is an automated notification from the Birdies Hub.
              </p>
            </td>
          </tr>
          <!-- FOOTER -->
          <tr>
            <td style="background-color:#1F4C25; padding:22px; border-radius:0 0 16px 16px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="font-family:Inter, Arial, sans-serif; font-size:12px; color:#FFFFFF; opacity:0.75;">
                    © Birdies Bayside
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
}

// Cache for API key
let cachedApiKey: { key: string; expiresAt: Date } | null = null;

async function getApiKey(supabase: any, clubUrl: string): Promise<string> {
  // Check if cached key is still valid (with 5 min buffer)
  if (cachedApiKey && cachedApiKey.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return cachedApiKey.key;
  }

  // Try to get from database first
  const { data: config } = await supabase
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (config && new Date(config.expires_at) > new Date(Date.now() + 5 * 60 * 1000)) {
    cachedApiKey = { key: config.api_key, expiresAt: new Date(config.expires_at) };
    return config.api_key;
  }

  // Need to authenticate and get new key
  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password || !clubUrl) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  // Use the correct endpoint: apikey/create (matching sgt-sync)
  console.log(`[SGT-REGISTER] Requesting API key from ${SGT_BASE_URL}/${clubUrl}/apikey/create`);
  
  const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error(`[SGT-REGISTER] API key request failed: ${response.status}, body: ${responseText.substring(0, 200)}`);
    throw new Error(`SGT API temporarily unavailable. Please try again in a few minutes.`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (parseError) {
    console.error(`[SGT-REGISTER] Invalid JSON response: ${responseText.substring(0, 200)}`);
    throw new Error("SGT API returned invalid response. Please try again in a few minutes.");
  }
  
  // Response format is { success: boolean, key: string, expires: number }
  if (!data.success || !data.key) {
    console.error(`[SGT-REGISTER] API key auth failed:`, data);
    throw new Error("Failed to authenticate with SGT API");
  }

  // Store in database - use expires from response (in seconds)
  const expiresAt = new Date(Date.now() + (data.expires * 1000));
  await supabase.from("sgt_api_config").upsert({
    api_key: data.key,
    expires_at: expiresAt.toISOString(),
    updated_at: new Date().toISOString(),
  });

  cachedApiKey = { key: data.key, expiresAt };
  console.log("[SGT-REGISTER] API key obtained successfully");
  return data.key;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clubUrl = Deno.env.get("SGT_CLUB_URL")!;

  const authHeader = req.headers.get("Authorization");
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
  });

  const adminClient = createClient(supabaseUrl, serviceKey);

  try {
    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error("[SGT-REGISTER] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, username, password } = await req.json();
    console.log(`[SGT-REGISTER] Action: ${action}, User: ${user.id}`);

    const apiKey = await getApiKey(adminClient, clubUrl);

     if (action === "check-username") {
      // Check if username is available by checking existing members
      const membersResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/list?api-key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );

      if (!membersResponse.ok) {
        const body = await membersResponse.text();
        console.error(`[SGT-REGISTER] members/list failed: ${membersResponse.status} ${body.substring(0, 200)}`);
        throw new Error("Failed to fetch members list");
      }

      const membersData = await membersResponse.json();
      const existingUsernames = (membersData.members || []).map((m: any) => 
        m.user_name.toLowerCase()
      );

      const isAvailable = !existingUsernames.includes(username.toLowerCase());

      return new Response(
        JSON.stringify({ available: isAvailable }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

     if (action === "register") {
      if (!username || !password) {
        return new Response(
          JSON.stringify({ error: "Username and password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate username format (2-64 alphanumeric or underscore)
      if (!/^[a-zA-Z0-9_]{2,64}$/.test(username)) {
        return new Response(
          JSON.stringify({ error: "Username must be 2-64 alphanumeric characters or underscores" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate password (min 6 chars)
      if (password.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Register the new user with SGT
      // According to API docs: all params go in form-encoded body including api-key
      // Endpoint: POST /{clubUrl}/members/register-new
      // Body: api-key, user_name, user_email, user_password_new
      const formData = new URLSearchParams();
      formData.append("api-key", apiKey);
      formData.append("user_name", username);
      formData.append("user_email", user.email!);
      formData.append("user_password_new", password);

      console.log(`[SGT-REGISTER] Registering user: ${username} with email: ${user.email}`);
      console.log(`[SGT-REGISTER] POST ${SGT_BASE_URL}/${clubUrl}/members/register-new`);

      const registerResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/register-new`,
        {
          method: "POST",
          headers: { 
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "*/*"
          },
          body: formData.toString(),
        }
      );

      const registerText = await registerResponse.text();
      console.log(`[SGT-REGISTER] Raw response (${registerResponse.status}): ${registerText.substring(0, 500)}`);
      
      let registerData: any = null;
      try {
        registerData = JSON.parse(registerText);
      } catch {
        // Response is not JSON - could be error message
        console.error(`[SGT-REGISTER] Non-JSON response: ${registerText}`);
      }

      console.log(`[SGT-REGISTER] Parsed register response:`, registerData);

      // Handle non-JSON responses (usually error messages)
      if (registerData === null) {
        const upperText = registerText.toUpperCase();
        if (upperText.includes("INVALID API KEY")) {
          // Clear cached key and suggest retry
          cachedApiKey = null;
          return new Response(
            JSON.stringify({
              error: "SGT authentication expired. Please try again.",
              details: registerText,
            }),
            { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            error: "SGT API returned an unexpected response. Please try again.",
            details: registerText,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check HTTP status
      if (!registerResponse.ok) {
        return new Response(
          JSON.stringify({
            error: registerData?.feedback || "SGT API error. Please try again.",
            details: registerData,
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check API success flag - response format: { successful: boolean, feedback: string, userData: { user_game_id, username } }
      if (registerData.successful === false) {
        return new Response(
          JSON.stringify({ 
            error: registerData.feedback || "Registration failed",
            details: registerData 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // If successful is not explicitly true, something unexpected happened
      if (registerData.successful !== true) {
        console.warn(`[SGT-REGISTER] Unexpected response format:`, registerData);
        return new Response(
          JSON.stringify({ 
            error: "Unexpected response from SGT. Please try again.",
            details: registerData 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Extract user_id from the response
      // The API returns userData with user_game_id and username
      // We need to fetch the members list to get the actual user_id
      const membersResponse = await fetch(
        `${SGT_BASE_URL}/${clubUrl}/members/list?api-key=${encodeURIComponent(apiKey)}`,
        { method: "GET" }
      );

      if (!membersResponse.ok) {
        throw new Error("Failed to fetch members after registration");
      }

      const membersData = await membersResponse.json();
      const newMember = (membersData.members || []).find((m: any) => 
        m.user_name.toLowerCase() === username.toLowerCase()
      );

      if (!newMember) {
        console.error("[SGT-REGISTER] Could not find newly registered member");
        return new Response(
          JSON.stringify({ 
            error: "Registration succeeded but could not find member ID. Please contact support." 
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const sgtUserId = newMember.user_id;
      console.log(`[SGT-REGISTER] Found new member with SGT user_id: ${sgtUserId}`);

      // Update the user's profile with the SGT user ID
      // This will trigger the auto-registration for tours/tournaments
      const { error: updateError } = await adminClient
        .from("profiles")
        .update({ sgt_user_id: sgtUserId })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("[SGT-REGISTER] Failed to update profile:", updateError);
        return new Response(
          JSON.stringify({ 
            error: "Account created but failed to link. Please contact support.",
            sgt_user_id: sgtUserId
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`[SGT-REGISTER] Successfully linked SGT account ${sgtUserId} to user ${user.id}`);

      // Check if new member email notification is enabled
      const { data: notificationSettings } = await adminClient
        .from("sgt_notification_settings")
        .select("new_member_email_enabled")
        .limit(1)
        .maybeSingle();

      if (notificationSettings?.new_member_email_enabled) {
        console.log("[SGT-REGISTER] Sending new member notification email...");
        
        // Get admin email from the current authenticated user's session or use a default
        const { data: adminProfile } = await adminClient
          .from("profiles")
          .select("email")
          .eq("user_id", user.id)
          .single();

        try {
          const emailHtml = buildNewMemberEmail({
            username,
            email: user.email!,
            sgtUserId,
            registeredAt: new Date().toISOString(),
          });

          await resend.emails.send({
            from: "Birdies Bayside <info@birdiesbayside.com.au>",
            to: ["info@birdiesbayside.com.au"],
            subject: `🎉 New League Member: ${username}`,
            html: emailHtml,
          });
          console.log("[SGT-REGISTER] New member notification email sent");
        } catch (emailError) {
          console.error("[SGT-REGISTER] Failed to send notification email:", emailError);
          // Don't fail the registration if email fails
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          sgt_user_id: sgtUserId,
          username: username,
          message: "SGT account created and linked successfully!"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-REGISTER] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
