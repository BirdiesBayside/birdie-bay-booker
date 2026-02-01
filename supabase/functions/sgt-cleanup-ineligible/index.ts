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

    // 1. Get active tour
    const { data: activeTour } = await supabase
      .from("sgt_tours")
      .select("tour_id, name")
      .eq("active", 1)
      .limit(1)
      .single();

    if (!activeTour) {
      return new Response(
        JSON.stringify({ error: "No active tour found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-CLEANUP] Active tour: ${activeTour.name} (ID: ${activeTour.tour_id})`);

    // 2. Get current tournament
    const { data: currentTournament } = await supabase
      .from("sgt_tournaments")
      .select("tournament_id, name, status")
      .eq("tour_id", activeTour.tour_id)
      .in("status", ["Upcoming", "In Progress", "Active"])
      .order("start_date", { ascending: false })
      .limit(1)
      .single();

    console.log(`[SGT-CLEANUP] Current tournament: ${currentTournament?.name || 'None'} (ID: ${currentTournament?.tournament_id || 'N/A'})`);

    // 3. Get all tour members
    const { data: tourMembers } = await supabase
      .from("sgt_tour_members")
      .select("user_id, user_name")
      .eq("tour_id", activeTour.tour_id);

    if (!tourMembers || tourMembers.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tour members found", removed: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[SGT-CLEANUP] Found ${tourMembers.length} tour members`);

    // 4. Get exempt members
    const { data: exemptMembers } = await supabase
      .from("sgt_members")
      .select("user_id")
      .eq("exempt_from_cleanup", true);

    const exemptUserIds = new Set((exemptMembers || []).map(m => m.user_id));
    console.log(`[SGT-CLEANUP] Found ${exemptUserIds.size} exempt members`);

    // 5. Get linked profiles with paying memberships
    const { data: linkedProfiles } = await supabase
      .from("profiles")
      .select("sgt_user_id, membership_tier")
      .not("sgt_user_id", "is", null)
      .neq("membership_tier", "visitor");

    const payingMemberIds = new Set((linkedProfiles || []).map(p => p.sgt_user_id));
    console.log(`[SGT-CLEANUP] Found ${payingMemberIds.size} paying members`);

    // 6. Filter to ineligible members (not exempt AND not paying)
    const ineligibleMembers = tourMembers.filter(member => {
      const isExempt = exemptUserIds.has(member.user_id);
      const isPaying = payingMemberIds.has(member.user_id);
      return !isExempt && !isPaying;
    });

    console.log(`[SGT-CLEANUP] Found ${ineligibleMembers.length} ineligible members to remove`);

    if (ineligibleMembers.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: "No ineligible members found",
          tour: activeTour.name,
          tournament: currentTournament?.name,
          removed: [] 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List who will be removed
    console.log("[SGT-CLEANUP] Ineligible members:", ineligibleMembers.map(m => m.user_name).join(", "));

    if (dryRun) {
      return new Response(
        JSON.stringify({ 
          message: "Dry run - no changes made",
          tour: activeTour.name,
          tournament: currentTournament?.name,
          would_remove: ineligibleMembers.map(m => ({ user_id: m.user_id, user_name: m.user_name }))
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await getApiKey(supabase);
    const results: { user_name: string; user_id: number; tournament_removed: boolean; tour_removed: boolean; error?: string }[] = [];

    for (const member of ineligibleMembers) {
      const result: typeof results[0] = {
        user_name: member.user_name,
        user_id: member.user_id,
        tournament_removed: false,
        tour_removed: false,
      };

      try {
        // Remove from current tournament registration
        if (currentTournament) {
          const deleteRegForm = new URLSearchParams();
          deleteRegForm.append("api-key", apiKey);
          deleteRegForm.append("tournamentId", currentTournament.tournament_id.toString());
          deleteRegForm.append("tourId", activeTour.tour_id.toString());
          deleteRegForm.append("userId", member.user_id.toString());

          const deleteRegResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/registrations/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: deleteRegForm.toString(),
          });

          const deleteRegData = await deleteRegResponse.json();
          result.tournament_removed = deleteRegData.success === true;
          console.log(`[SGT-CLEANUP] Tournament removal for ${member.user_name}:`, deleteRegData);
        }

        // Remove from tour
        const removeTourForm = new URLSearchParams();
        removeTourForm.append("api-key", apiKey);
        removeTourForm.append("tourId", activeTour.tour_id.toString());
        removeTourForm.append("userId", member.user_id.toString());

        const removeTourResponse = await fetch(`${SGT_BASE_URL}/${CLUB_URL}/tours/remove-member`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: removeTourForm.toString(),
        });

        const removeTourData = await removeTourResponse.json();
        result.tour_removed = removeTourData.success === true;
        console.log(`[SGT-CLEANUP] Tour removal for ${member.user_name}:`, removeTourData);

        // Remove from local sgt_tour_members table
        await supabase
          .from("sgt_tour_members")
          .delete()
          .eq("user_id", member.user_id)
          .eq("tour_id", activeTour.tour_id);

        console.log(`[SGT-CLEANUP] ✓ Cleaned up ${member.user_name}`);
      } catch (error) {
        result.error = error instanceof Error ? error.message : "Unknown error";
        console.error(`[SGT-CLEANUP] Error cleaning up ${member.user_name}:`, error);
      }

      results.push(result);
      
      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    const successCount = results.filter(r => r.tournament_removed || r.tour_removed).length;

    console.log(`[SGT-CLEANUP] Completed: ${successCount}/${ineligibleMembers.length} removed`);

    return new Response(
      JSON.stringify({
        success: true,
        tour: activeTour.name,
        tournament: currentTournament?.name,
        total_ineligible: ineligibleMembers.length,
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
