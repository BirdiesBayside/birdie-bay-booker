import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";

let cachedApiKey: string | null = null;
let apiKeyExpiry: number = 0;

async function getApiKey(clubUrl: string): Promise<string> {
  const now = Date.now();
  
  if (cachedApiKey && apiKeyExpiry > now + 300000) {
    return cachedApiKey;
  }

  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  console.log("[SGT-MEMBER-MGMT] Requesting new API key...");
  
  const response = await fetch(`${SGT_BASE_URL}/${clubUrl}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const data = await response.json();

  if (!data.success || !data.key) {
    console.error("[SGT-MEMBER-MGMT] API key response:", data);
    throw new Error("Failed to authenticate with SGT API");
  }

  cachedApiKey = data.key;
  apiKeyExpiry = now + (data.expires * 1000);
  
  console.log("[SGT-MEMBER-MGMT] API key obtained successfully");
  return cachedApiKey as string;
}

async function sgtRequest(
  clubUrl: string, 
  endpoint: string, 
  method: "GET" | "POST" = "GET",
  body?: Record<string, string>
): Promise<unknown> {
  const apiKey = await getApiKey(clubUrl);
  
  if (method === "GET") {
    const url = new URL(`${SGT_BASE_URL}/${clubUrl}${endpoint}`);
    url.searchParams.append("api-key", apiKey);
    
    console.log(`[SGT-MEMBER-MGMT] GET: ${endpoint}`);
    const response = await fetch(url.toString());
    
    if (!response.ok) {
      throw new Error(`SGT API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data === "INVALID API KEY") {
      cachedApiKey = null;
      apiKeyExpiry = 0;
      throw new Error("Invalid API key - please retry");
    }
    
    return data;
  } else {
    const formData = new URLSearchParams();
    formData.append("api-key", apiKey);
    
    if (body) {
      for (const [key, value] of Object.entries(body)) {
        formData.append(key, value);
      }
    }
    
    console.log(`[SGT-MEMBER-MGMT] POST: ${endpoint}`, body);
    const response = await fetch(`${SGT_BASE_URL}/${clubUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
    
    const data = await response.json();
    console.log(`[SGT-MEMBER-MGMT] Response:`, data);
    
    if (data === "INVALID API KEY") {
      cachedApiKey = null;
      apiKeyExpiry = 0;
      throw new Error("Invalid API key - please retry");
    }
    
    return data;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clubUrl = Deno.env.get("SGT_CLUB_URL") || "birdiesbayside";

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
      console.error("[SGT-MEMBER-MGMT] Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, ...params } = await req.json();
    console.log(`[SGT-MEMBER-MGMT] Action: ${action}`, params);

    let result: unknown;

    switch (action) {
      case "delete-member": {
        // Delete/remove a member from the club
        const { userId } = params;
        if (!userId) throw new Error("userId is required");

        // Try the members/delete endpoint
        const response = await sgtRequest(clubUrl, "/members/delete", "POST", {
          user_id: userId.toString(),
        });

        // Also remove from our local database
        await adminClient
          .from("sgt_members")
          .delete()
          .eq("user_id", userId);

        // Clear the sgt_user_id from any linked profile
        await adminClient
          .from("profiles")
          .update({ sgt_user_id: null })
          .eq("sgt_user_id", userId);

        result = { success: true, response };
        break;
      }

      case "deactivate-member": {
        // Deactivate a member (make inactive)
        const { userId } = params;
        if (!userId) throw new Error("userId is required");

        const response = await sgtRequest(clubUrl, "/members/deactivate", "POST", {
          user_id: userId.toString(),
        });

        // Update local database
        await adminClient
          .from("sgt_members")
          .update({ user_active: 0 })
          .eq("user_id", userId);

        result = { success: true, response };
        break;
      }

      case "activate-member": {
        // Reactivate a member
        const { userId } = params;
        if (!userId) throw new Error("userId is required");

        const response = await sgtRequest(clubUrl, "/members/activate", "POST", {
          user_id: userId.toString(),
        });

        // Update local database
        await adminClient
          .from("sgt_members")
          .update({ user_active: 1 })
          .eq("user_id", userId);

        result = { success: true, response };
        break;
      }

      case "add-to-tour": {
        // Add a member to a tour
        const { userId, tourId, customHcp } = params;
        if (!userId || !tourId) throw new Error("userId and tourId are required");

        const body: Record<string, string> = {
          user_id: userId.toString(),
          tour_id: tourId.toString(),
        };
        
        if (customHcp !== undefined) {
          body.custom_hcp = customHcp.toString();
        }

        const response = await sgtRequest(clubUrl, "/tours/add-member", "POST", body);

        result = { success: true, response };
        break;
      }

      case "remove-from-tour": {
        // Remove a member from a tour
        const { userId, tourId } = params;
        if (!userId || !tourId) throw new Error("userId and tourId are required");

        const response = await sgtRequest(clubUrl, "/tours/remove-member", "POST", {
          user_id: userId.toString(),
          tour_id: tourId.toString(),
        });

        // Also remove from local database
        await adminClient
          .from("sgt_tour_members")
          .delete()
          .eq("user_id", userId)
          .eq("tour_id", tourId);

        result = { success: true, response };
        break;
      }

      case "add-to-tournament": {
        // Register a member for a tournament
        const { userId, tournamentId } = params;
        if (!userId || !tournamentId) throw new Error("userId and tournamentId are required");

        const response = await sgtRequest(clubUrl, "/tournaments/add-member", "POST", {
          user_id: userId.toString(),
          tournament_id: tournamentId.toString(),
        });

        result = { success: true, response };
        break;
      }

      case "remove-from-tournament": {
        // Remove a member from a tournament
        const { userId, tournamentId } = params;
        if (!userId || !tournamentId) throw new Error("userId and tournamentId are required");

        const response = await sgtRequest(clubUrl, "/tournaments/remove-member", "POST", {
          user_id: userId.toString(),
          tournament_id: tournamentId.toString(),
        });

        result = { success: true, response };
        break;
      }

      case "bulk-add-to-tour": {
        // Add multiple members to a tour
        const { userIds, tourId, customHcp } = params;
        if (!userIds || !Array.isArray(userIds) || !tourId) {
          throw new Error("userIds (array) and tourId are required");
        }

        const results = [];
        for (const userId of userIds) {
          try {
            const body: Record<string, string> = {
              user_id: userId.toString(),
              tour_id: tourId.toString(),
            };
            
            if (customHcp !== undefined) {
              body.custom_hcp = customHcp.toString();
            }

            const response = await sgtRequest(clubUrl, "/tours/add-member", "POST", body);
            results.push({ userId, success: true, response });
          } catch (error) {
            results.push({ 
              userId, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
          }
        }

        result = { success: true, results };
        break;
      }

      case "bulk-add-to-tournament": {
        // Add multiple members to a tournament
        const { userIds, tournamentId } = params;
        if (!userIds || !Array.isArray(userIds) || !tournamentId) {
          throw new Error("userIds (array) and tournamentId are required");
        }

        const results = [];
        for (const userId of userIds) {
          try {
            const response = await sgtRequest(clubUrl, "/tournaments/add-member", "POST", {
              user_id: userId.toString(),
              tournament_id: tournamentId.toString(),
            });
            results.push({ userId, success: true, response });
          } catch (error) {
            results.push({ 
              userId, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
          }
        }

        result = { success: true, results };
        break;
      }

      case "get-tour-members": {
        // Get members registered for a tour
        const { tourId } = params;
        if (!tourId) throw new Error("tourId is required");

        const response = await sgtRequest(clubUrl, `/tours/members?tour_id=${tourId}`);
        result = response;
        break;
      }

      case "get-tournament-members": {
        // Get members registered for a tournament
        const { tournamentId } = params;
        if (!tournamentId) throw new Error("tournamentId is required");

        const response = await sgtRequest(clubUrl, `/tournaments/members?tournament_id=${tournamentId}`);
        result = response;
        break;
      }

      case "update-member-handicap": {
        // Update a member's custom handicap for a tour
        const { userId, tourId, customHcp } = params;
        if (!userId || !tourId) throw new Error("userId and tourId are required");

        const response = await sgtRequest(clubUrl, "/tours/update-member", "POST", {
          user_id: userId.toString(),
          tour_id: tourId.toString(),
          custom_hcp: (customHcp || 0).toString(),
        });

        // Update local database
        await adminClient
          .from("sgt_tour_members")
          .update({ custom_hcp: customHcp })
          .eq("user_id", userId)
          .eq("tour_id", tourId);

        result = { success: true, response };
        break;
      }

      case "register-all-to-tour": {
        // Register all active SGT members to a tour
        const { tourId, useComboHandicap } = params;
        if (!tourId) throw new Error("tourId is required");

        // Get all active members from our database
        const { data: members, error: membersError } = await adminClient
          .from("sgt_members")
          .select("user_id, user_name")
          .eq("user_active", 1);

        if (membersError) throw membersError;

        // Get existing tour members to skip
        const { data: existingMembers } = await adminClient
          .from("sgt_tour_members")
          .select("user_id")
          .eq("tour_id", tourId);

        const existingUserIds = new Set(existingMembers?.map(m => m.user_id) || []);

        const results = [];
        let successCount = 0;
        let skipCount = 0;
        let errorCount = 0;

        for (const member of members || []) {
          // Skip if already registered
          if (existingUserIds.has(member.user_id)) {
            skipCount++;
            results.push({ userId: member.user_id, skipped: true });
            continue;
          }

          try {
            const body: Record<string, string> = {
              user_id: member.user_id.toString(),
              tour_id: tourId.toString(),
            };
            
            // Add combo handicap parameter if enabled
            if (useComboHandicap) {
              body.useComboCapstring = "true";
            }

            const response = await sgtRequest(clubUrl, "/tours/add-member", "POST", body);
            results.push({ userId: member.user_id, success: true, response });
            successCount++;
          } catch (error) {
            results.push({ 
              userId: member.user_id, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
            errorCount++;
          }
        }

        console.log(`[SGT-MEMBER-MGMT] Register all to tour ${tourId}: ${successCount} success, ${skipCount} skipped, ${errorCount} errors`);
        
        result = { 
          success: true, 
          successCount, 
          skipCount, 
          errorCount, 
          totalMembers: members?.length || 0,
          results 
        };
        break;
      }

      case "register-all-to-tournament": {
        // Register all tour members to a specific tournament
        const { tournamentId, tourId } = params;
        if (!tournamentId || !tourId) throw new Error("tournamentId and tourId are required");

        // Get all tour members
        const { data: tourMembers, error: tmError } = await adminClient
          .from("sgt_tour_members")
          .select("user_id, user_name")
          .eq("tour_id", tourId);

        if (tmError) throw tmError;

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const member of tourMembers || []) {
          try {
            const response = await sgtRequest(clubUrl, "/tournaments/add-member", "POST", {
              user_id: member.user_id.toString(),
              tournament_id: tournamentId.toString(),
            });
            results.push({ userId: member.user_id, success: true, response });
            successCount++;
          } catch (error) {
            results.push({ 
              userId: member.user_id, 
              success: false, 
              error: error instanceof Error ? error.message : "Unknown error" 
            });
            errorCount++;
          }
        }

        console.log(`[SGT-MEMBER-MGMT] Register all to tournament ${tournamentId}: ${successCount} success, ${errorCount} errors`);
        
        result = { 
          success: true, 
          successCount, 
          errorCount, 
          totalMembers: tourMembers?.length || 0,
          results 
        };
        break;
      }

      case "create-tour": {
        // Create a new tour
        const { tourname, startdate, enddate, active, tourtype, tourpublic } = params;
        if (!tourname || !startdate || !enddate) {
          throw new Error("tourname, startdate, and enddate are required");
        }

        const response = await sgtRequest(clubUrl, "/tours/create", "POST", {
          tourname: tourname,
          startdate: startdate,
          enddate: enddate,
          active: (active ?? 1).toString(),
          tourtype: (tourtype ?? 0).toString(),
          tourpublic: (tourpublic ?? 0).toString(),
        }) as { success?: boolean; feedback?: string; tourId?: number };

        if (response.success && response.tourId) {
          // Add the tour to our local database
          await adminClient
            .from("sgt_tours")
            .insert({
              tour_id: response.tourId,
              name: tourname,
              start_date: startdate,
              end_date: enddate,
              active: active ?? 1,
              team_tour: tourtype ?? 0,
            });
          
          console.log(`[SGT-MEMBER-MGMT] Created tour: ${tourname} (ID: ${response.tourId})`);
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback,
          tourId: response.tourId 
        };
        break;
      }

      case "edit-tour": {
        // Edit an existing tour
        const { tourId, tourname, startdate, enddate, active, tourtype, tourpublic } = params;
        if (!tourId || !tourname || !startdate || !enddate) {
          throw new Error("tourId, tourname, startdate, and enddate are required");
        }

        const response = await sgtRequest(clubUrl, "/tours/edit", "POST", {
          tourId: tourId.toString(),
          tourname: tourname,
          startdate: startdate,
          enddate: enddate,
          active: (active ?? 1).toString(),
          tourtype: (tourtype ?? 0).toString(),
          tourpublic: (tourpublic ?? 0).toString(),
        }) as { success?: boolean; feedback?: string };

        if (response.success) {
          // Update our local database
          await adminClient
            .from("sgt_tours")
            .update({
              name: tourname,
              start_date: startdate,
              end_date: enddate,
              active: active ?? 1,
              team_tour: tourtype ?? 0,
            })
            .eq("tour_id", tourId);
          
          console.log(`[SGT-MEMBER-MGMT] Updated tour: ${tourname} (ID: ${tourId})`);
        }

        result = { 
          success: response.success ?? false, 
          feedback: response.feedback 
        };
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[SGT-MEMBER-MGMT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
