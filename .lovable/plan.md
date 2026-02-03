
# Fix: TV Leaderboards Showing Blank Data

## Problem Identified
The Overall Standings (`/embed/tv-standings`) and Current Week (`/embed/tv-weekly`) TV displays are blank, while Last Week (`/embed/tv-lastweek`) works correctly.

**Root Cause**: Row Level Security (RLS) policies on `sgt_tours` and `sgt_tournaments` tables require authenticated users to read data. The TV embed pages are accessed anonymously (no login), so the client-side Supabase queries in `useActiveTourData` return empty results.

**Why Last Week Works**: The `EmbedTVLastWeek` page uses the `public-leaderboard` edge function, which runs server-side with the service role key and bypasses RLS.

## Solution Options

### Option A: Add Public SELECT Policies (Simplest)
Add RLS policies allowing anonymous SELECT access to tour/tournament metadata. This is low-risk since this data is already publicly visible on SGT's website.

### Option B: Move Active Tour Logic to Edge Function (Consistent Architecture)  
Create a new edge function endpoint to fetch active tour data server-side, similar to how `public-leaderboard` works. This keeps all TV displays using the same pattern.

## Recommended Approach: Option A + Fallback Enhancement

Since the tour and tournament data is non-sensitive metadata (tour names, tournament names, dates, statuses), adding public read access is appropriate and simpler. However, we'll also enhance the hook to be more resilient.

## Implementation Plan

### Step 1: Add Public SELECT Policies
Create RLS policies to allow anonymous read access to `sgt_tours` and `sgt_tournaments` tables:

```sql
CREATE POLICY "Public can view tours" ON public.sgt_tours
  FOR SELECT USING (true);

CREATE POLICY "Public can view tournaments" ON public.sgt_tournaments
  FOR SELECT USING (true);
```

### Step 2: Verify Existing Policies Don't Conflict
The existing "Authenticated users can view" policies are PERMISSIVE, so they will combine correctly with the new public policies using OR logic.

### Step 3: Test All Three TV Pages
After adding the policies:
- `/embed/tv-standings` - Should show overall tour standings
- `/embed/tv-weekly` - Should show current tournament leaderboard  
- `/embed/tv-lastweek` - Should continue working as before

---

## Technical Notes

- The `sgt-embed-scrape` edge function itself works correctly (verified with direct API calls)
- The `useSGTEmbedData` hook correctly handles the data when valid IDs are passed
- The issue is purely that `useActiveTourData` cannot fetch tour/tournament IDs without authentication
- No changes needed to the React components or hooks - only the database RLS policies

## Risk Assessment
- **Low Risk**: Tour/tournament metadata is already publicly visible on SGT website
- **No PII Exposure**: These tables contain only tour names, dates, and status - no personal data
- **Backward Compatible**: Authenticated users continue to have access as before
