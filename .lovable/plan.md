
# Birdies League Format Overhaul Plan

## Current State Analysis

### Existing API Architecture

| Function | Schedule | Purpose |
|----------|----------|---------|
| `sgt-refresh-api-key` | Daily 4am Brisbane (18:00 UTC) | Refreshes the 24-hour SGT API key |
| `sgt-daily-tournament-register` | Daily 6am Brisbane (20:00 UTC) | Registers tour members for tomorrow's tournaments |
| `sgt-course-sync` | Daily 1pm Brisbane (03:00 UTC) | Syncs course data |
| `sgt-sync` | **NOT SCHEDULED** | Main sync for tours, tournaments, standings, scorecards |
| `sgt-auto-register` | Triggered by admin onboarding | Registers new member for all active tournaments |

**Critical Finding**: The main `sgt-sync` function is NOT on a cron schedule! It only runs when manually triggered from the admin panel.

### API Call Summary

Currently, each sync cycle makes these calls:
1. `/members/list` - Get all club members
2. `/tours/list` - Get all tours
3. `/tours/standings?grossOrNet=gross` - Per active tour
4. `/tours/standings?grossOrNet=net` - Per active tour  
5. `/tours/members` - Per active tour (handicap refresh)
6. `/tournaments/list` - Per active tour
7. `/tournaments/scorecards` - Per **completed** tournament only

---

## Proposed Changes

### 1. Monthly Winner System (Build Our Own)

Since you're keeping one continuous tour, SGT's overall standings will accumulate points year-round. We need our own monthly aggregation:

**New Table: `sgt_monthly_standings`**
```
- id (uuid)
- tour_id (integer)
- month (text, e.g., "February 2026")
- player_name (text)
- player_id (integer)
- total_net_score (integer) - Sum of weekly to_par_net
- total_gross_score (integer) - Sum of weekly to_par_gross
- tournaments_played (integer)
- best_net (integer) - Best single-week net score
- position (integer) - Calculated rank
- created_at / updated_at
```

**Logic**: After each tournament completes, sum `to_par_net` and `to_par_gross` for all tournaments in that calendar month to calculate monthly rankings. The lower total wins.

**Benefits**:
- Uses existing `sgt_scorecards` data (no extra API calls)
- Works automatically as tournaments complete
- Supports both gross and net rankings
- Can handle partial months and DNFs

### 2. URL Leaderboard Scraper (Already Correct)

The current implementation in `useActiveTourData.ts` correctly:
1. Queries `sgt_tours` for `active = 1`
2. Queries `sgt_tournaments` ordered by `start_date DESC`
3. Returns the most recent tournament that has started

The `useSGTEmbedData` hook then scrapes `https://simulatorgolftour.com/embed/tournament/{id}/standings/net` for live scoring.

**No changes needed** - the scraper already dynamically finds the latest tournament.

### 3. Handicap Clarification

Based on SGT API documentation and your current implementation:

**How SGT Handicaps Work:**
- **hcp_index**: SGT's calculated "Combo HCP" based on a player's rounds
- **custom_hcp**: A manually-set override (only used if `useCustomCap=true`)
- New tour = **does NOT** reset handicaps (they're player-level, not tour-level)
- SGT calculates combo HCP from a player's best differentials across all their rounds

**Current Flow (First Week Only)**:
1. Admin links SGT account and sets `custom_hcp` in `sgt_tour_members`
2. `sgt-auto-register` checks if player has scorecards:
   - If NO scorecards: Uses `custom_hcp` for registration
   - If HAS scorecards: Uses SGT's combo HCP
3. After first tournament completes, `sgt-sync` refreshes `hcp_index` from SGT

This matches your preference of "first week only" - the custom HCP applies for their first tournament, then SGT takes over.

### 4. Pending Player Workflow Enhancement

Current flow is already correct but can be improved with better visibility:

```
1. Customer links SGT account → status: "pending"
2. Admin receives notification → navigates to SGT Manager
3. Admin sets custom_hcp → adds to sgt_tour_members
4. Database trigger fires sgt-auto-register → player registered for all active tournaments
5. Player plays first round → sgt-sync updates their hcp_index
6. Future tournaments use SGT combo HCP automatically
```

### 5. Schedule the Missing sgt-sync Cron Job

Add `sgt-sync` to run every 4 hours:

```sql
SELECT cron.schedule(
  'sgt-sync-regular',
  '0 */4 * * *',  -- Every 4 hours at :00
  $$
  SELECT net.http_post(
    url := 'https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/sgt-sync',
    headers := '{"Content-Type": "application/json", "x-sync-secret": "<SYNC_SECRET>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

---

## Implementation Tasks

### Phase 1: Fix Missing Sync Schedule
1. Add `sgt-sync` to cron.job table (every 4 hours)
2. Verify API key refresh timing aligns (currently 4am Brisbane)

### Phase 2: Monthly Winner Tables
1. Create `sgt_monthly_standings` table with RLS
2. Create edge function `sgt-calculate-monthly-standings` that:
   - Queries `sgt_scorecards` filtered by tournament start_date
   - Groups by player and sums scores for the calendar month
   - Upserts into `sgt_monthly_standings`
3. Trigger calculation when tournaments complete (in `sgt-sync` or via webhook)

### Phase 3: Update SGTWinners Component
1. Add a new "Monthly Leaderboard" section showing computed standings
2. Allow admin to confirm/award monthly winner from the calculated rankings
3. Show both net and gross monthly standings

### Phase 4: Documentation Updates
1. Update memory files with new monthly winner logic
2. Document the complete API call flow

---

## Technical Details

### API Efficiency Optimizations Already in Place:
- Scorecards only fetched for **Completed** tournaments (not in-progress)
- Live leaderboards use the **web scraper** (no API key required)
- API key is cached and refreshed daily at 4am
- Handicap refresh only for players in completed tournaments

### Proposed API Call Schedule:
| Time (Brisbane) | Function | API Calls |
|-----------------|----------|-----------|
| 4:00 AM | sgt-refresh-api-key | 1 (auth) |
| 6:00 AM | sgt-daily-tournament-register | 1-3 per tournament |
| Every 4 hours | sgt-sync | ~15-25 total |
| On-demand | sgt-embed-scrape | 0 (web scrape only) |

### Monthly Calculation SQL Example:
```sql
SELECT 
  player_name,
  player_id,
  COUNT(DISTINCT tournament_id) as tournaments_played,
  SUM(to_par_net) as total_net_score,
  SUM(to_par_gross) as total_gross_score,
  MIN(to_par_net) as best_net
FROM sgt_scorecards sc
JOIN sgt_tournaments t ON sc.tournament_id = t.tournament_id
WHERE t.status = 'Completed'
  AND to_char(t.start_date, 'Month YYYY') = 'February 2026'
GROUP BY player_name, player_id
ORDER BY total_net_score ASC;
```
