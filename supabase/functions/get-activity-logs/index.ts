import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Verify the user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAuth = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get the user from the token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', {
      _user_id: user.id,
      _role: 'admin'
    });

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch auth logs from the analytics API
    // Note: This uses the Supabase project's analytics/logs API
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1];
    
    // Since we can't directly access the analytics API from edge functions,
    // we'll query auth.users for recent activity as a fallback
    // and combine with any audit log data we have
    
    // Get recent auth user changes (sign ups, updates)
    const { data: recentUsers, error: usersError } = await supabaseAdmin
      .from('profiles')
      .select('user_id, email, first_name, last_name, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(50);

    // Build activity events from available data
    const events: any[] = [];

    if (recentUsers) {
      for (const profile of recentUsers) {
        // Check if user was recently created (signup event)
        const createdAt = new Date(profile.created_at);
        const now = new Date();
        const hoursSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        
        if (hoursSinceCreation < 168) { // Within last week
          events.push({
            id: `signup-${profile.user_id}`,
            timestamp: profile.created_at,
            event_type: "signup",
            email: profile.email,
            status: 200,
            path: "/auth/v1/signup",
            msg: `Account created: ${profile.first_name} ${profile.last_name}`,
          });
        }

        // Check if updated (could be password change, profile update, etc)
        if (profile.updated_at !== profile.created_at) {
          const updatedAt = new Date(profile.updated_at);
          const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceUpdate < 168) {
            events.push({
              id: `update-${profile.user_id}-${profile.updated_at}`,
              timestamp: profile.updated_at,
              event_type: "profile_update",
              email: profile.email,
              status: 200,
              path: "/profile/update",
              msg: `Profile updated: ${profile.first_name} ${profile.last_name}`,
            });
          }
        }
      }
    }

    // Try to get recent bookings as proxy for user activity (login events)
    const { data: recentBookings } = await supabaseAdmin
      .from('bookings')
      .select(`
        id,
        created_at,
        user_id,
        status
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    if (recentBookings) {
      for (const booking of recentBookings) {
        // Get profile for this booking
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('email, first_name, last_name')
          .eq('user_id', booking.user_id)
          .single();

        if (profile) {
          events.push({
            id: `booking-${booking.id}`,
            timestamp: booking.created_at,
            event_type: "activity",
            email: profile.email,
            status: 200,
            path: "/booking",
            msg: `Booking ${booking.status}: ${profile.first_name} ${profile.last_name}`,
          });
        }
      }
    }

    // Sort by timestamp descending
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return new Response(
      JSON.stringify({ events: events.slice(0, 50) }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error fetching activity logs:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage, events: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
