import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SGT_BASE_URL = "https://simulatorgolftour.com/sgt-api/club-admin";
const CLUB_URL = "birdiesbayside";

async function getApiKey(supabase: unknown): Promise<string> {
  const client = supabase as ReturnType<typeof createClient>;
  
  // Try cached key first
  const { data: configData } = await client
    .from("sgt_api_config")
    .select("api_key, expires_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const config = configData as { api_key: string; expires_at: string } | null;
  if (config?.api_key && new Date(config.expires_at) > new Date(Date.now() + 300000)) {
    return config.api_key;
  }

  // Get fresh key
  const username = Deno.env.get("SGT_USERNAME");
  const password = Deno.env.get("SGT_PASSWORD");

  if (!username || !password) {
    throw new Error("SGT credentials not configured");
  }

  const formData = new URLSearchParams();
  formData.append("username", username);
  formData.append("password", password);

  console.log("[SGT-CLEANUP] Requesting new API key...");
  
  const response = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/apikey/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
  });

  const data = await response.json();

  if (!data.success || !data.key) {
    throw new Error("Failed to authenticate with SGT API");
  }

  // Cache the new key
  const expiresAt = new Date(Date.now() + data.expires * 1000).toISOString();
  await client.from("sgt_api_config").upsert({
    id: "singleton",
    api_key: data.key,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  } as never);

  console.log("[SGT-CLEANUP] API key obtained successfully");
  return data.key;
}

// Helper to extract arrays from SGT API responses
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
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run ?? false;

    console.log(`[SGT-CLEANUP] Starting ineligible member cleanup (dry_run: ${dryRun})`);

    const apiKey = await getApiKey(supabase);

    // 1. Get active tour from SGT API
    const toursResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/list?api-key=${apiKey}`);
    const toursData = await toursResponse.json();
    const allTours = extractArray(toursData, ['tours', 'results']) as { tourId: number; name: string; active: number }[];
    const activeTour = allTours.find(t => t.active === 1);

    if (!activeTour) {
      return new Response(
        JSON.stringify({ error: "No active tour found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-CLEANUP] Active tour: ${activeTour.name} (ID: ${activeTour.tourId})`);

    // 2. Get current tournament from local database (more reliable than API)
    const { data: localTournaments } = await supabase
      .from("sgt_tournaments")
      .select("tournament_id, name, status, start_date, end_date")
      .eq("tour_id", activeTour.tourId)
      .in("status", ["Upcoming", "In Progress", "Active"])
      .order("start_date", { ascending: false })
      .limit(1);

    const currentTournament = localTournaments?.[0];

    if (!currentTournament) {
      return new Response(
        JSON.stringify({ error: "No current tournament found", message: "No upcoming or in-progress tournaments in local database" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-CLEANUP] Current tournament: ${currentTournament.name} (ID: ${currentTournament.tournament_id})`);

    // 3. Get tour members from SGT API
    const tourMembersResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/members?api-key=${apiKey}&tourId=${activeTour.tourId}`);
    const tourMembersData = await tourMembersResponse.json();
    const tourMembers = extractArray(tourMembersData, ['members', 'results']) as { user_id: number; user_name: string }[];

    console.log(`[SGT-CLEANUP] Tour has ${tourMembers.length} members from SGT API`);

    // 4. Get tournament registrations from SGT API
    const registrationsResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/view?api-key=${apiKey}&tournamentId=${currentTournament.tournament_id}`);
    const registrationsData = await registrationsResponse.json();
    const registrations = extractArray(registrationsData, ['registrations', 'results']) as { user_id: number; user_name?: string }[];

    console.log(`[SGT-CLEANUP] Tournament has ${registrations.length} registrations from SGT API`);

    // 5. Get exempt members from our database
    const { data: exemptMembers } = await supabase
      .from("sgt_members")
      .select("user_id")
      .eq("exempt_from_cleanup", true);

    const exemptUserIds = new Set((exemptMembers || []).map(m => m.user_id));
    console.log(`[SGT-CLEANUP] Found ${exemptUserIds.size} exempt members: ${Array.from(exemptUserIds).join(', ')}`);

    // 6. Get linked profiles with paying memberships
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("sgt_user_id, membership_tier, email, first_name, last_name")
      .not("sgt_user_id", "is", null)
      .neq("membership_tier", "visitor");

    const payingMemberIds = new Set((linkedProfiles || []).map(p => p.sgt_user_id));
    console.log(`[SGT-CLEANUP] Found ${payingMemberIds.size} paying members: ${linkedProfiles?.map(p => `${p.sgt_user_id}`).join(', ')}`);

    // 7. Find ineligible tour members (not exempt AND not paying)
    const ineligibleTourMembers = tourMembers.filter(member => {
      const isExempt = exemptUserIds.has(member.user_id);
      const isPaying = payingMemberIds.has(member.user_id);
      return !isExempt && !isPaying;
    });

    console.log(`[SGT-CLEANUP] Found ${ineligibleTourMembers.length} ineligible TOUR members: ${ineligibleTourMembers.map(m => m.user_name).join(', ')}`);

    // 8. Find ineligible tournament registrations (not exempt AND not paying)
    const ineligibleRegistrations = registrations.filter(reg => {
      const isExempt = exemptUserIds.has(reg.user_id);
      const isPaying = payingMemberIds.has(reg.user_id);
      return !isExempt && !isPaying;
    });

    console.log(`[SGT-CLEANUP] Found ${ineligibleRegistrations.length} ineligible TOURNAMENT registrations`);

    // Combine all unique user IDs that need cleanup
    const allIneligibleUsers = new Map<number, string>();
    
    for (const member of ineligibleTourMembers) {
      allIneligibleUsers.set(member.user_id, member.user_name);
    }
    
    for (const reg of ineligibleRegistrations) {
      if (!allIneligibleUsers.has(reg.user_id)) {
        // Try to get username from tour members or use a placeholder
        const tourMember = tourMembers.find(m => m.user_id === reg.user_id);
        allIneligibleUsers.set(reg.user_id, tourMember?.user_name || reg.user_name || `User_${reg.user_id}`);
      }
    }

    console.log(`[SGT-CLEANUP] Total unique ineligible users: ${allIneligibleUsers.size}`);
    console.log(`[SGT-CLEANUP] Users to remove: ${Array.from(allIneligibleUsers.values()).join(', ')}`);

    if (allIneligibleUsers.size === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No ineligible members found",
          tour: activeTour.name,
          tournament: currentTournament.name,
          tour_members_checked: tourMembers.length,
          registrations_checked: registrations.length,
          exempt_count: exemptUserIds.size,
          paying_count: payingMemberIds.size,
          removed: [] 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (dryRun) {
      return new Response(
        JSON.stringify({ 
          message: "Dry run - no changes made",
          tour: activeTour.name,
          tournament: currentTournament.name,
          tour_members_checked: tourMembers.length,
          registrations_checked: registrations.length,
          ineligible_tour_members: ineligibleTourMembers.length,
          ineligible_registrations: ineligibleRegistrations.length,
          would_remove: Array.from(allIneligibleUsers.entries()).map(([id, name]) => ({ user_id: id, user_name: name }))
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Perform actual cleanup
    const results: { user_name: string; user_id: number; tournament_removed: boolean; tour_removed: boolean; error?: string }[] = [];

    for (const [userId, userName] of allIneligibleUsers) {
      const result: typeof results[0] = {
        user_name: userName,
        user_id: userId,
        tournament_removed: false,
        tour_removed: false,
      };

      try {
        // Remove from tournament registration
        const isRegistered = registrations.some(r => r.user_id === userId);
        if (isRegistered) {
          const deleteRegForm = new URLSearchParams();
          deleteRegForm.append("api-key", apiKey);
          deleteRegForm.append("tournamentId", currentTournament.tournament_id.toString());
          deleteRegForm.append("tourId", activeTour.tourId.toString());
          deleteRegForm.append("userId", userId.toString());

          const deleteRegResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: deleteRegForm.toString(),
          });

          const deleteRegData = await deleteRegResponse.json();
          result.tournament_removed = deleteRegData.success === true;
          console.log(`[SGT-CLEANUP] Tournament removal for ${userName}:`, deleteRegData);
        }

        // Remove from tour
        const isInTour = tourMembers.some(m => m.user_id === userId);
        if (isInTour) {
          const removeTourForm = new URLSearchParams();
          removeTourForm.append("api-key", apiKey);
          removeTourForm.append("tourId", activeTour.tourId.toString());
          removeTourForm.append("userId", userId.toString());

          const removeTourResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/remove-member`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: removeTourForm.toString(),
          });

          const removeTourData = await removeTourResponse.json();
          result.tour_removed = removeTourData.success === true;
          console.log(`[SGT-CLEANUP] Tour removal for ${userName}:`, removeTourData);
        }

        // Remove from local sgt_tour_members table
        await supabase
          .from("sgt_tour_members")
          .delete()
          .eq("user_id", userId)
          .eq("tour_id", activeTour.tourId);

        console.log(`[SGT-CLEANUP] ✓ Cleaned up ${userName}`);
      } catch (error) {
        result.error = error instanceof Error ? error.message : "Unknown error";
        console.error(`[SGT-CLEANUP] Error cleaning up ${userName}:`, error);
      }

      results.push(result);
      
      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const successCount = results.filter(r => r.tournament_removed || r.tour_removed).length;

    console.log(`[SGT-CLEANUP] Completed: ${successCount}/${allIneligibleUsers.size} removed`);

    return new Response(
      JSON.stringify({
        success: true,
        tour: activeTour.name,
        tournament: currentTournament.name,
        total_ineligible: allIneligibleUsers.size,
        removed: successCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[SGT-CLEANUP] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
