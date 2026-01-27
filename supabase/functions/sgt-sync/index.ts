import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// Build branded email for new pending member notification
function buildPendingMemberEmail(data: { 
  firstName: string; 
  lastName: string; 
  email: string; 
  sgtUsername: string; 
  sgtUserId: number; 
  linkedAt: string;
  onboardingUrl: string;
}): string {
  const linkDate = new Date(data.linkedAt).toLocaleString("en-AU", {
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
  <title>New Pending Member - Action Required</title>
  <style>
    @import url("https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;600&display=swap");
  </style>
</head>
<body style="margin:0; padding:0; background-color:#FFF5E4;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#FFF5E4;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px; width:100%;">
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
          <tr>
            <td style="background-color:#FFF5E4; padding:26px 22px; border-left:1px solid rgba(31,76,37,0.12); border-right:1px solid rgba(31,76,37,0.12);">
              <h1 style="margin:0 0 14px; font-family:Anton, Impact, Arial Black, sans-serif; font-size:34px; line-height:1.1; color:#1F4C25; text-align:center;">
                🆕 New Pending Member!
              </h1>
              <p style="margin:0 0 8px; font-family:Inter, Arial, sans-serif; font-size:16px; line-height:1.6; color:#1F4C25; text-align:center;">
                A Hub member has been linked to their SGT account.
              </p>
              <p style="margin:0 0 18px; font-family:Inter, Arial, sans-serif; font-size:14px; line-height:1.6; color:#EC622D; text-align:center; font-weight:600;">
                ⚠️ Action Required: Set their handicap to complete onboarding
              </p>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FFFFFF; border-radius:12px; margin:18px 0; border-left:4px solid #EC622D;">
                <tr>
                  <td style="padding:20px; font-family:Inter, Arial, sans-serif; font-size:15px; color:#1F4C25;">
                    <h3 style="margin:0 0 16px 0; font-family:Anton, Impact, Arial Black, sans-serif; color:#1F4C25;">Member Details</h3>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>Name:</strong></td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">${data.firstName} ${data.lastName}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>SGT Username:</strong></td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">${data.sgtUsername}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>Email:</strong></td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">
                          <a href="mailto:${data.email}" style="color:#1F4C25;">${data.email}</a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; border-bottom:1px solid #eee;"><strong>SGT User ID:</strong></td>
                        <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right;">${data.sgtUserId}</td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0;"><strong>Linked:</strong></td>
                        <td style="padding:8px 0; text-align:right;">${linkDate}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding:10px 0 20px;">
                    <a href="${data.onboardingUrl}" 
                       style="display:inline-block; background-color:#EC622D; color:#FFFFFF; font-family:Anton, Impact, Arial Black, sans-serif; font-size:18px; padding:14px 32px; text-decoration:none; border-radius:8px; letter-spacing:0.5px;">
                      ONBOARD PLAYER →
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin:18px 0 0; font-family:Inter, Arial, sans-serif; font-size:13px; line-height:1.6; color:#666; text-align:center;">
                The member will be held in a "pending" state until you set their handicap.<br/>
                Once onboarded, they'll be automatically registered for all active tours and tournaments.
              </p>
            </td>
          </tr>
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

// Send notification email for newly linked pending member
async function sendPendingMemberNotification(data: {
  firstName: string;
  lastName: string;
  email: string;
  sgtUsername: string;
  sgtUserId: number;
}): Promise<boolean> {
  try {
    const siteUrl = Deno.env.get("SITE_URL") || "https://birdie-bay-bookings.lovable.app";
    const onboardingUrl = `${siteUrl}/admin/sgt?tab=registrations`;
    
    const html = buildPendingMemberEmail({
      ...data,
      linkedAt: new Date().toISOString(),
      onboardingUrl,
    });

    const { error } = await resend.emails.send({
      from: "Birdies Bayside <noreply@birdiesbayside.com.au>",
      to: ["info@birdiesbayside.com.au"],
      subject: `🆕 New Pending Member: ${data.firstName} ${data.lastName}`,
      html,
    });

    if (error) {
      console.error("[SGT-SYNC] Failed to send notification email:", error);
      return false;
    }

    console.log(`[SGT-SYNC] ✉️ Sent pending member notification for ${data.email}`);
    return true;
  } catch (e) {
    console.error("[SGT-SYNC] Error sending notification email:", e);
    return false;
  }
}

let cachedApiKey: { key: string; expiresAt: Date } | null = null;

// Try to refresh an existing API key before it expires
async function refreshApiKey(existingKey: string): Promise<{ key: string; expiresAt: Date } | null> {
  const formData = new URLSearchParams();
  formData.append("api-key", existingKey);

  console.log(`[SGT-SYNC] Attempting to refresh API key...`);
  
  try {
    const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!response.ok) {
      console.log(`[SGT-SYNC] Refresh failed with status ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.success || !data.key) {
      console.log(`[SGT-SYNC] Refresh unsuccessful:`, data);
      return null;
    }

    console.log(`[SGT-SYNC] API key refreshed successfully`);
    return {
      key: data.key,
      expiresAt: new Date(Date.now() + (data.expires * 1000)),
    };
  } catch (e) {
    console.error(`[SGT-SYNC] Refresh error:`, e);
    return null;
  }
}

// Create a new API key using username/password
async function createNewApiKey(): Promise<{ key: string; expiresAt: Date }> {
  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  console.log("[SGT-SYNC] Creating new API key...");
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const data = await response.json();

  if (!data.success || !data.key) {
    throw new Error("Failed to authenticate with SGT API");
  }

  console.log("[SGT-SYNC] New API key created successfully");
  return {
    key: data.key,
    expiresAt: new Date(Date.now() + (data.expires * 1000)),
  };
}

async function getApiKey(supabase?: any): Promise<string> {
  const BUFFER_MS = 5 * 60 * 1000; // 5 minute buffer

  // Check if cached key is still valid
  if (cachedApiKey && cachedApiKey.expiresAt.getTime() > Date.now() + BUFFER_MS) {
    return cachedApiKey.key;
  }

  // Try to get from database first (if supabase client provided)
  if (supabase) {
    const { data: config } = await supabase
      .from("sgt_api_config")
      .select("api_key, expires_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (config?.api_key) {
      const expiresAt = new Date(config.expires_at);
      const timeUntilExpiry = expiresAt.getTime() - Date.now();

      // If key is still valid with buffer, use it
      if (timeUntilExpiry > BUFFER_MS) {
        cachedApiKey = { key: config.api_key, expiresAt };
        return config.api_key;
      }

      // Key exists but expiring soon - try to REFRESH it first
      console.log(`[SGT-SYNC] Key expiring in ${Math.round(timeUntilExpiry / 1000)}s, attempting refresh...`);
      const refreshed = await refreshApiKey(config.api_key);
      
      if (refreshed) {
        // Store refreshed key in DB
        await supabase.from("sgt_api_config").upsert({
          api_key: refreshed.key,
          expires_at: refreshed.expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        });
        cachedApiKey = refreshed;
        return refreshed.key;
      }
      
      console.log(`[SGT-SYNC] Refresh failed, creating new key...`);
    }
  } else if (cachedApiKey) {
    // No supabase but have cached key - try refresh
    const refreshed = await refreshApiKey(cachedApiKey.key);
    if (refreshed) {
      cachedApiKey = refreshed;
      return refreshed.key;
    }
  }

  // No valid key or refresh failed - create new one
  const newKey = await createNewApiKey();
  cachedApiKey = newKey;

  // Store in database if supabase client provided
  if (supabase) {
    await supabase.from("sgt_api_config").upsert({
      api_key: newKey.key,
      expires_at: newKey.expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return newKey.key;
}

async function sgtRequest(endpoint: string, params: Record<string, string> = {}): Promise<unknown> {
  const apiKey = await getApiKey();
  const url = new URL(`${SGT_BASE_URL}/${CLUB_URL}${endpoint}`);
  url.searchParams.append("api-key", apiKey);
  
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, value);
  }

  console.log(`[SGT-SYNC] Fetching: ${endpoint}`);
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    throw new Error(`SGT API error: ${response.status}`);
  }

  const data = await response.json();
  
  if (data === "INVALID API KEY") {
    cachedApiKey = null;
    throw new Error("Invalid API key");
  }

  return data;
}

function extractArray(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of keys) {
      if (key in data && Array.isArray((data as Record<string, unknown>)[key])) {
        return (data as Record<string, unknown>)[key] as unknown[];
      }
    }
  }
  return [];
}


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check for sync secret OR admin user
  const syncSecret = req.headers.get("x-sync-secret");
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  
  let authorized = false;
  
  // Option 1: Valid sync secret (for cron/automated calls)
  if (expectedSecret && syncSecret === expectedSecret) {
    authorized = true;
  }
  
  // Option 2: Authenticated admin user
  if (!authorized) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      });
      
      const { data: { user } } = await userClient.auth.getUser(token);
      if (user) {
        // Check if user is admin
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin");
        
        if (roles && roles.length > 0) {
          authorized = true;
          console.log(`[SGT-SYNC] Triggered by admin user: ${user.email}`);
        }
      }
    }
  }
  
  if (!authorized) {
    console.error("[SGT-SYNC] Unauthorized sync attempt - invalid secret or not admin");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // supabase client already created above

  let totalRecords = 0;
  const newMemberUserIds: number[] = []; // Track newly discovered members for auto-registration

  try {
    console.log("[SGT-SYNC] Starting SGT data sync...");

    // 1. Sync Members and detect new ones
    console.log("[SGT-SYNC] Syncing members...");
    const membersResponse = await sgtRequest("/members/list");
    const members = extractArray(membersResponse, ['members', 'results']);
    
    // Get existing member IDs from our database
    const { data: existingMembers } = await supabase
      .from("sgt_members")
      .select("user_id");
    const existingMemberIds = new Set(existingMembers?.map(m => m.user_id) || []);
    
    for (const member of members) {
      const m = member as { user_id: number; user_name: string; user_email?: string; user_active?: number; user_country_code?: string; user_has_avatar?: string; user_game_id?: string };
      
      // Track new members for auto-registration
      if (!existingMemberIds.has(m.user_id)) {
        newMemberUserIds.push(m.user_id);
        console.log(`[SGT-SYNC] New member detected: ${m.user_name} (ID: ${m.user_id})`);
      }
      
      await supabase.from("sgt_members").upsert({
        user_id: m.user_id,
        user_name: m.user_name,
        user_email: m.user_email,
        user_active: m.user_active ?? 1,
        user_country_code: m.user_country_code,
        user_has_avatar: m.user_has_avatar,
        user_game_id: m.user_game_id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      totalRecords++;
    }
    console.log(`[SGT-SYNC] Synced ${members.length} members (${newMemberUserIds.length} new)`);

    // CLEANUP: Remove SGT members who no longer have active Birdies memberships
    // This ensures only paying members retain SGT access
    console.log("[SGT-SYNC] Running membership cleanup...");
    let cleanupCount = 0;
    
    // Get all SGT members from our local database with their linked Birdies profiles
    const { data: sgtMembersForCleanup } = await supabase
      .from("sgt_members")
      .select("user_id, user_name, exempt_from_cleanup");
    
    // Get profiles linked to SGT with their membership tiers
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("sgt_user_id, membership_tier, first_name, last_name")
      .not("sgt_user_id", "is", null);
    
    // Create a map of sgt_user_id -> membership_tier
    const membershipMap = new Map<number, string>();
    for (const profile of linkedProfiles || []) {
      if (profile.sgt_user_id) {
        membershipMap.set(profile.sgt_user_id, profile.membership_tier);
      }
    }
    
    // Find members to remove: linked to a 'visitor' tier OR not linked at all
    // Exclude those marked as exempt_from_cleanup
    for (const sgtMember of sgtMembersForCleanup || []) {
      // Skip exempt members (e.g., Daryl_C)
      if (sgtMember.exempt_from_cleanup) {
        console.log(`[SGT-SYNC] Skipping cleanup for exempt member: ${sgtMember.user_name}`);
        continue;
      }
      
      const membershipTier = membershipMap.get(sgtMember.user_id);
      
      // If linked to a visitor OR not linked to any Birdies account, remove from SGT
      if (membershipTier === 'visitor' || membershipTier === undefined) {
        console.log(`[SGT-SYNC] Removing ${sgtMember.user_name} (ID: ${sgtMember.user_id}) - tier: ${membershipTier || 'not linked'}`);
        
        try {
          // Delete from SGT platform via API
          const apiKey = await getApiKey(supabase);
          const formData = new URLSearchParams();
          formData.append("api-key", apiKey);
          formData.append("user_id", sgtMember.user_id.toString());
          
          const deleteResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/members/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          });
          
          const deleteData = await deleteResponse.json();
          console.log(`[SGT-SYNC] Delete response for ${sgtMember.user_name}:`, deleteData);
          
          // Remove from local sgt_members table
          await supabase
            .from("sgt_members")
            .delete()
            .eq("user_id", sgtMember.user_id);
          
          // Clear sgt_user_id from profile if linked
          if (membershipTier !== undefined) {
            await supabase
              .from("profiles")
              .update({ sgt_user_id: null })
              .eq("sgt_user_id", sgtMember.user_id);
          }
          
          // Remove from tour members
          await supabase
            .from("sgt_tour_members")
            .delete()
            .eq("user_id", sgtMember.user_id);
          
          cleanupCount++;
        } catch (cleanupError) {
          console.error(`[SGT-SYNC] Error removing ${sgtMember.user_name}:`, cleanupError);
        }
      }
    }
    
    if (cleanupCount > 0) {
      console.log(`[SGT-SYNC] ✓ Cleanup complete: removed ${cleanupCount} inactive members from SGT`);
    } else {
      console.log("[SGT-SYNC] No inactive members to clean up");
    }

    // AUTO-LINK: Match SGT members to Birdies profiles by email
    // This handles cases where users registered on SGT directly and weren't linked
    console.log("[SGT-SYNC] Checking for unlinked profiles to auto-link...");
    let linkedCount = 0;
    
    // Check notification settings
    const { data: notifSettings } = await supabase
      .from("sgt_notification_settings")
      .select("new_member_email_enabled")
      .limit(1)
      .maybeSingle();
    
    const shouldSendNotifications = notifSettings?.new_member_email_enabled === true;
    console.log(`[SGT-SYNC] Notification emails enabled: ${shouldSendNotifications}`);
    
    // Get all profiles that don't have an sgt_user_id set
    const { data: unlinkedProfiles } = await supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name")
      .is("sgt_user_id", null);
    
    if (unlinkedProfiles && unlinkedProfiles.length > 0) {
      // Get all SGT members with emails for matching
      const { data: sgtMembersWithEmail } = await supabase
        .from("sgt_members")
        .select("user_id, user_email, user_name")
        .not("user_email", "is", null);
      
      if (sgtMembersWithEmail && sgtMembersWithEmail.length > 0) {
        // Create email-to-sgt_user_id lookup map (case-insensitive)
        const emailToSgtId = new Map<string, { user_id: number; user_name: string }>();
        for (const member of sgtMembersWithEmail) {
          if (member.user_email) {
            emailToSgtId.set(member.user_email.toLowerCase(), {
              user_id: member.user_id,
              user_name: member.user_name
            });
          }
        }
        
        // Check each unlinked profile for a matching SGT account
        for (const profile of unlinkedProfiles) {
          const sgtMatch = emailToSgtId.get(profile.email.toLowerCase());
          
          if (sgtMatch) {
            console.log(`[SGT-SYNC] 🔗 Auto-linking ${profile.first_name} ${profile.last_name} (${profile.email}) to SGT account "${sgtMatch.user_name}" (ID: ${sgtMatch.user_id})`);
            
            // Update the profile with the SGT user ID
            // This will trigger the on_sgt_user_id_set trigger which calls sgt-auto-register
            const { error: linkError } = await supabase
              .from("profiles")
              .update({ sgt_user_id: sgtMatch.user_id })
              .eq("user_id", profile.user_id);
            
            if (linkError) {
              console.error(`[SGT-SYNC] ✗ Failed to link ${profile.email}:`, linkError);
            } else {
              console.log(`[SGT-SYNC] ✓ Successfully linked ${profile.email} to SGT ID ${sgtMatch.user_id}`);
              linkedCount++;
              
              // Send notification email if enabled
              if (shouldSendNotifications) {
                await sendPendingMemberNotification({
                  firstName: profile.first_name,
                  lastName: profile.last_name,
                  email: profile.email,
                  sgtUsername: sgtMatch.user_name,
                  sgtUserId: sgtMatch.user_id,
                });
              }
            }
          }
        }
      }
    }
    
    if (linkedCount > 0) {
      console.log(`[SGT-SYNC] Auto-linked ${linkedCount} profiles to SGT accounts`);
    } else {
      console.log("[SGT-SYNC] No unlinked profiles found with matching SGT accounts");
    }

    // 2. Sync Tours
    console.log("[SGT-SYNC] Syncing tours...");
    const toursResponse = await sgtRequest("/tours/list");
    const tours = extractArray(toursResponse, ['tours', 'results']);
    
    for (const tour of tours) {
      const t = tour as { tourId: number; name: string; start_date?: string; end_date?: string; teamTour?: number; active?: number };
      await supabase.from("sgt_tours").upsert({
        tour_id: t.tourId,
        name: t.name,
        start_date: t.start_date,
        end_date: t.end_date,
        team_tour: t.teamTour ?? 0,
        active: t.active ?? 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'tour_id' });
      totalRecords++;
    }
    console.log(`[SGT-SYNC] Synced ${tours.length} tours`);

    // Get active tours for further syncing
    const activeTours = tours.filter((t: unknown) => (t as { active?: number }).active === 1);

    // 3. Sync Tour Standings and Members for active tours
    for (const tour of activeTours) {
      const t = tour as { tourId: number; name: string };
      console.log(`[SGT-SYNC] Syncing tour: ${t.name}`);

      // Standings (gross)
      try {
        const standingsResponse = await sgtRequest("/tours/standings", { tourId: t.tourId.toString(), grossOrNet: "gross" });
        const standings = extractArray(standingsResponse, ['standings', 'results']);
        
        for (const standing of standings) {
          const s = standing as { user_name: string; country_code?: string; user_has_avatar?: string; hcp?: number; events?: number; first?: number; top5?: number; top10?: number; points?: number; position?: number };
          await supabase.from("sgt_tour_standings").upsert({
            tour_id: t.tourId,
            user_name: s.user_name,
            country_code: s.country_code,
            user_has_avatar: s.user_has_avatar,
            hcp: s.hcp,
            events: s.events ?? 0,
            first: s.first ?? 0,
            top5: s.top5 ?? 0,
            top10: s.top10 ?? 0,
            points: s.points ?? 0,
            position: s.position,
            gross_or_net: "gross",
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tour_id,user_name,gross_or_net' });
          totalRecords++;
        }
        console.log(`[SGT-SYNC] Synced ${standings.length} gross standings for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing gross standings for tour ${t.tourId}:`, e);
      }

      // Standings (net)
      try {
        const standingsNetResponse = await sgtRequest("/tours/standings", { tourId: t.tourId.toString(), grossOrNet: "net" });
        const standingsNet = extractArray(standingsNetResponse, ['standings', 'results']);
        
        for (const standing of standingsNet) {
          const s = standing as { user_name: string; country_code?: string; user_has_avatar?: string; hcp?: number; events?: number; first?: number; top5?: number; top10?: number; points?: number; position?: number };
          await supabase.from("sgt_tour_standings").upsert({
            tour_id: t.tourId,
            user_name: s.user_name,
            country_code: s.country_code,
            user_has_avatar: s.user_has_avatar,
            hcp: s.hcp,
            events: s.events ?? 0,
            first: s.first ?? 0,
            top5: s.top5 ?? 0,
            top10: s.top10 ?? 0,
            points: s.points ?? 0,
            position: s.position,
            gross_or_net: "net",
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tour_id,user_name,gross_or_net' });
          totalRecords++;
        }
        console.log(`[SGT-SYNC] Synced ${standingsNet.length} net standings for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing net standings for tour ${t.tourId}:`, e);
      }

      // Tour Members
      // IMPORTANT: Only sync tour members who are ALREADY in our sgt_tour_members table.
      // This prevents SGT-added members from bypassing the admin onboarding step.
      // New members should only be added via the admin onboarding UI or sgt-auto-register.
      try {
        const tourMembersResponse = await sgtRequest("/tours/members", { tourId: t.tourId.toString() });
        const tourMembers = extractArray(tourMembersResponse, ['members', 'results']);
        
        // Get existing tour members from our local DB for this tour
        const { data: existingLocalTourMembers } = await supabase
          .from("sgt_tour_members")
          .select("user_id")
          .eq("tour_id", t.tourId);
        
        const localTourMemberIds = new Set((existingLocalTourMembers || []).map(m => m.user_id));
        
        let syncedCount = 0;
        let skippedCount = 0;
        
        for (const member of tourMembers) {
          const m = member as { user_id: number; user_name: string; hcp_index?: number; custom_hcp?: number };
          
          // Only update members who are ALREADY in our local tour_members table
          // This prevents bypassing the onboarding process for pending members
          if (localTourMemberIds.has(m.user_id)) {
            await supabase.from("sgt_tour_members").upsert({
              tour_id: t.tourId,
              user_id: m.user_id,
              user_name: m.user_name,
              hcp_index: m.hcp_index,
              // Don't overwrite custom_hcp - preserve admin-set value
              // custom_hcp is intentionally NOT updated here
              updated_at: new Date().toISOString(),
            }, { onConflict: 'tour_id,user_id' });
            syncedCount++;
            totalRecords++;
          } else {
            // Member is on SGT but not in our local DB - skip (pending onboarding)
            skippedCount++;
          }
        }
        console.log(`[SGT-SYNC] Tour ${t.tourId}: synced ${syncedCount} members, skipped ${skippedCount} (pending onboarding)`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing members for tour ${t.tourId}:`, e);
      }

      // 4. Sync Tournaments for this tour and auto-register members if enabled
      try {
        // Check if auto-register tournaments is enabled for this tour
        const { data: tourSettings } = await supabase
          .from("sgt_tour_settings")
          .select("auto_register_tournaments, use_combo_handicap")
          .eq("tour_id", t.tourId)
          .maybeSingle();

        const autoRegisterEnabled = tourSettings?.auto_register_tournaments ?? false;
        const useComboHcp = tourSettings?.use_combo_handicap ?? true;

        const tournamentsResponse = await sgtRequest("/tournaments/list", { tourId: t.tourId.toString() });
        const tournaments = extractArray(tournamentsResponse, ['results', 'tournaments']);
        
        // Get existing tournaments from our DB to detect new ones
        const { data: existingTournaments } = await supabase
          .from("sgt_tournaments")
          .select("tournament_id")
          .eq("tour_id", t.tourId);
        
        const existingTournamentIds = new Set(existingTournaments?.map(t => t.tournament_id) || []);
        
        // AUTO-REGISTER NEW MEMBERS to tour and active/upcoming tournaments
        if (newMemberUserIds.length > 0 && autoRegisterEnabled) {
          // First, add new members to the tour itself
          const tourMembersForReg = extractArray(await sgtRequest("/tours/members", { tourId: t.tourId.toString() }), ['members', 'results']) as { user_id: number }[];
          const existingTourMemberIds = new Set(tourMembersForReg.map(m => m.user_id));
          
          for (const newUserId of newMemberUserIds) {
            if (!existingTourMemberIds.has(newUserId)) {
              try {
                const apiKey = await getApiKey();
                const formData = new URLSearchParams();
                formData.append("api-key", apiKey);
                formData.append("tourId", t.tourId.toString());
                formData.append("user_id", newUserId.toString());
                formData.append("useComboCapstring", useComboHcp ? "true" : "false");
                
                const addResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/add-member`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: formData.toString(),
                });
                
                const addData = await addResponse.json();
                if (addData.success || addData.successful) {
                  console.log(`[SGT-SYNC] ✓ Added new member ${newUserId} to tour ${t.name}`);
                } else {
                  console.error(`[SGT-SYNC] ✗ Failed to add member ${newUserId} to tour ${t.name}:`, addData);
                }
              } catch (addError) {
                console.error(`[SGT-SYNC] Error adding member ${newUserId} to tour ${t.name}:`, addError);
              }
            }
          }
          
          // Now register new members for active/upcoming tournaments
          const today = new Date().toISOString().split('T')[0];
          const activeTournaments = tournaments.filter((tourn: unknown) => {
            const t = tourn as { status?: string; end_date?: string };
            const isActive = t.status === "Upcoming" || t.status === "Active" || t.status === "In Progress";
            const notEnded = !t.end_date || t.end_date >= today;
            return isActive && notEnded;
          });
          
          console.log(`[SGT-SYNC] Auto-registering ${newMemberUserIds.length} new members to ${activeTournaments.length} active tournaments for tour ${t.name}`);
          
          for (const tournament of activeTournaments) {
            const tourn = tournament as { tournamentId: number; name: string };
            
            // Get existing registrations for this tournament
            const registrationsResponse = await sgtRequest("/registrations/view", { 
              tournamentId: tourn.tournamentId.toString() 
            });
            const existingRegistrations = extractArray(registrationsResponse, ['registrations', 'results']) as { user_id: number }[];
            const registeredUserIds = new Set(existingRegistrations.map(r => r.user_id));
            
            // Register new members who aren't already registered
            // Note: teeType is omitted so API uses tournament default tees
            for (const newUserId of newMemberUserIds) {
              if (registeredUserIds.has(newUserId)) {
                console.log(`[SGT-SYNC] User ${newUserId} already registered for ${tourn.name}`);
                continue;
              }
              
              try {
                const apiKey = await getApiKey();
                const formData = new URLSearchParams();
                formData.append("api-key", apiKey);
                formData.append("tournamentId", tourn.tournamentId.toString());
                formData.append("tourId", t.tourId.toString());
                formData.append("registrationList[0][user_id]", newUserId.toString());
                formData.append("registrationList[0][useComboCap]", useComboHcp ? "true" : "false");
                formData.append("registrationList[0][useCustomCap]", "false");
                
                const regResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/register-members`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: formData.toString(),
                });
                
                const regData = await regResponse.json();
                if (regData.success || regData.successful) {
                  console.log(`[SGT-SYNC] ✓ Auto-registered user ${newUserId} to ${tourn.name}`);
                } else {
                  console.error(`[SGT-SYNC] ✗ Failed to auto-register user ${newUserId} to ${tourn.name}:`, regData);
                }
              } catch (regError) {
                console.error(`[SGT-SYNC] Error auto-registering user ${newUserId} to ${tourn.name}:`, regError);
              }
            }
          }
        }
        
        for (const tournament of tournaments.slice(0, 20)) { // Limit to recent 20 tournaments
          const tourn = tournament as { tournamentId: number; name: string; courseName?: string; status?: string; start_date?: string; end_date?: string };
          
          const isNewTournament = !existingTournamentIds.has(tourn.tournamentId);
          const isUpcoming = tourn.status === "Upcoming" || tourn.status === "Active" || tourn.status === "In Progress";
          
          await supabase.from("sgt_tournaments").upsert({
            tournament_id: tourn.tournamentId,
            tour_id: t.tourId,
            name: tourn.name,
            course_name: tourn.courseName,
            status: tourn.status,
            start_date: tourn.start_date,
            end_date: tourn.end_date,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tournament_id' });
          totalRecords++;

          // Auto-register all tour members to new tournaments if enabled
          if (autoRegisterEnabled && isNewTournament && isUpcoming) {
            console.log(`[SGT-SYNC] Auto-registering members to new tournament: ${tourn.name} (ID: ${tourn.tournamentId})`);
            
            // Get all tour members
            const { data: tourMembersData } = await supabase
              .from("sgt_tour_members")
              .select("user_id, user_name")
              .eq("tour_id", t.tourId);
            
            if (tourMembersData && tourMembersData.length > 0) {
              let registered = 0;
              let errors = 0;
              
              for (const member of tourMembersData) {
                try {
                  const apiKey = await getApiKey();
                  const formData = new URLSearchParams();
                  formData.append("api-key", apiKey);
                  formData.append("user_id", member.user_id.toString());
                  formData.append("tournament_id", tourn.tournamentId.toString());
                  
                  const regResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tournaments/add-member`, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: formData.toString(),
                  });
                  
                  const regData = await regResponse.json();
                  if (regData.success || regData.feedback?.includes("already")) {
                    registered++;
                  } else {
                    errors++;
                    console.error(`[SGT-SYNC] Failed to register ${member.user_name} to tournament:`, regData);
                  }
                } catch (regError) {
                  errors++;
                  console.error(`[SGT-SYNC] Error registering ${member.user_name}:`, regError);
                }
              }
              
              console.log(`[SGT-SYNC] Auto-registration complete for ${tourn.name}: ${registered} registered, ${errors} errors`);
            }
          }

          // 5. Sync Scorecards for this tournament
          try {
            const scorecardsResponse = await sgtRequest("/tournaments/scorecards", { tournamentId: tourn.tournamentId.toString() });
            const scorecards = extractArray(scorecardsResponse, ['scorecards', 'results']);
            
            // Track which scorecards exist in SGT for this tournament
            const sgtScorecardKeys = new Set<string>();
            
            for (const scorecard of scorecards) {
              const sc = scorecard as Record<string, unknown>;
              const playerId = sc.playerId as number;
              const round = (sc.round as number) ?? 1;
              
              // Create a unique key for this scorecard
              sgtScorecardKeys.add(`${playerId}-${round}`);
              
              // Extract ALL hole-related fields (h1_Par, h1_index, hole1_gross, hole1_net, etc.)
              const holeData: Record<string, unknown> = {};
              for (const [key, value] of Object.entries(sc)) {
                // Capture h*_Par, h*_index, hole*_gross, hole*_net patterns
                if (/^h\d+/.test(key) || /^hole\d+/.test(key)) {
                  holeData[key] = value;
                }
              }

              await supabase.from("sgt_scorecards").upsert({
                tournament_id: tourn.tournamentId,
                player_id: playerId,
                player_name: sc.player_name as string,
                hcp_index: sc.hcp_index as number,
                round: round,
                course_name: sc.courseName as string,
                teetype: sc.teetype as string,
                rating: sc.rating as number,
                slope: sc.slope as number,
                total_gross: sc.total_gross as number,
                total_net: sc.total_net as number,
                to_par_gross: sc.toPar_gross as number,
                to_par_net: sc.toPar_net as number,
                in_gross: sc.in_gross as number,
                out_gross: sc.out_gross as number,
                in_net: sc.in_net as number,
                out_net: sc.out_net as number,
                hole_data: holeData,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'tournament_id,player_id,round' });
              totalRecords++;
            }
            
            // Delete scorecards that no longer exist in SGT for this tournament
            const { data: existingScorecards } = await supabase
              .from("sgt_scorecards")
              .select("player_id, round")
              .eq("tournament_id", tourn.tournamentId);
            
            if (existingScorecards) {
              for (const existing of existingScorecards) {
                const key = `${existing.player_id}-${existing.round}`;
                if (!sgtScorecardKeys.has(key)) {
                  await supabase
                    .from("sgt_scorecards")
                    .delete()
                    .eq("tournament_id", tourn.tournamentId)
                    .eq("player_id", existing.player_id)
                    .eq("round", existing.round);
                  console.log(`[SGT-SYNC] Deleted scorecard: tournament ${tourn.tournamentId}, player ${existing.player_id}, round ${existing.round}`);
                }
              }
            }
            
            console.log(`[SGT-SYNC] Synced ${scorecards.length} scorecards for tournament ${tourn.tournamentId}`);
          } catch (e) {
            console.error(`[SGT-SYNC] Error syncing scorecards for tournament ${tourn.tournamentId}:`, e);
          }
        }
        console.log(`[SGT-SYNC] Synced ${tournaments.length} tournaments for tour ${t.tourId}`);
      } catch (e) {
        console.error(`[SGT-SYNC] Error syncing tournaments for tour ${t.tourId}:`, e);
      }
    }

    console.log(`[SGT-SYNC] Sync completed! ${totalRecords} records synced.`);

    return new Response(
      JSON.stringify({ success: true, records: totalRecords }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-SYNC] Sync error:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
