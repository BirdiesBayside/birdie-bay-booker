import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const COURSE_MANIFEST_URL = "https://simulatorgolftour.com/course_manifest.json";

interface Course {
  courseId: number;
  coursekey: string;
  Name: string;
  Par: number;
  Difficulty: number;
  CourseDesigner: string;
  City: string;
  State: string;
  Country: string;
  CourseLocation: string;
  ElevationInFeet: number;
  remoteThumbnailImage: string;
  Description: string;
}

function log(message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  if (data) {
    console.log(`[${timestamp}] [SGT-COURSE-SYNC] ${message}`, JSON.stringify(data));
  } else {
    console.log(`[${timestamp}] [SGT-COURSE-SYNC] ${message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify sync secret for cron jobs, or allow authenticated requests
  const syncSecret = req.headers.get("x-sync-secret");
  const authHeader = req.headers.get("authorization");
  const expectedSecret = Deno.env.get("SYNC_SECRET");
  
  if (!authHeader && syncSecret !== expectedSecret) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    log("Starting course manifest sync...");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Fetch course manifest
    log("Fetching course manifest from SGT...");
    const response = await fetch(COURSE_MANIFEST_URL);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch course manifest: ${response.status}`);
    }

    const courses: Course[] = await response.json();
    log(`Fetched ${courses.length} courses from manifest`);

    // Prepare course data for upsert
    const courseRecords = courses.map((course) => ({
      course_id: course.courseId,
      course_key: course.coursekey || null,
      name: course.Name || "Unknown Course",
      par: course.Par || null,
      difficulty: course.Difficulty || null,
      course_designer: course.CourseDesigner || null,
      city: course.City || null,
      state: course.State || null,
      country: course.Country || null,
      course_location: course.CourseLocation || null,
      elevation_in_feet: course.ElevationInFeet || null,
      thumbnail_url: course.remoteThumbnailImage || null,
      description: course.Description ? course.Description.substring(0, 1000) : null,
      updated_at: new Date().toISOString(),
    }));

    // Upsert in batches of 500
    const batchSize = 500;
    let totalSynced = 0;

    for (let i = 0; i < courseRecords.length; i += batchSize) {
      const batch = courseRecords.slice(i, i + batchSize);
      
      const { error } = await supabaseAdmin
        .from("sgt_courses")
        .upsert(batch, { onConflict: "course_id" });

      if (error) {
        log(`Error upserting batch ${i / batchSize + 1}:`, error);
        throw error;
      }

      totalSynced += batch.length;
      log(`Synced batch ${Math.floor(i / batchSize) + 1}: ${batch.length} courses (total: ${totalSynced})`);
    }

    log(`Course sync completed! ${totalSynced} courses synced.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${totalSynced} courses`,
        count: totalSynced,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    log("Course sync failed:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
