

## Local Competition Manager — Implementation Plan

### Overview
A new "Local Comps" section in the admin portal to manage weekly in-house Ambrose tournaments, with entry fee tracking, score entry with handicap calculations, winner selection, and public-facing leaderboard displays.

---

### Database Tables (3 new tables)

**`local_competitions`** — one row per weekly comp
- id, name, date, format (default "2-man-ambrose"), entry_fee, status (upcoming/active/completed), created_at, created_by

**`local_comp_teams`** — teams registered for a comp
- id, competition_id (FK), team_name, player1_name, player1_handicap, player2_name, player2_handicap, combined_handicap (auto-calculated: (p1+p2)/4), gross_score, net_score (gross - combined_handicap), paid (boolean, default false), position, created_at

**`local_comp_settings`** — global config
- id, default_entry_fee, default_format, created_at, updated_at

All tables get admin-only RLS + public SELECT on competitions/teams for the TV/embed displays.

---

### Admin Portal Changes

1. **New nav item** — "Local Comps" with a trophy/target icon, added to the sidebar in `AdminLayout.tsx` between SGT Manager and Analytics

2. **New page `src/pages/admin/AdminLocalComps.tsx`** — tabbed layout (following SGT Manager pattern) with:
   - **Competitions tab** — list of comps, create new comp dialog (name, date, entry fee), status badges
   - **Score Entry tab** — select active comp, register teams (2 player names + handicaps), auto-calculate combined handicap ((p1+p2)/4), enter gross score, auto-calculate net score, mark as paid (checkbox), live leaderboard sorted by net score
   - **Results tab** — final leaderboard for completed comps, winner highlight, ability to mark comp as completed

3. **Team registration form** — Player 1 name + handicap, Player 2 name + handicap, team name (optional, auto-generated from player names). Combined handicap calculated and displayed in real-time.

4. **Payment tracking** — Simple paid/unpaid toggle per team with a visual indicator (green tick). No Stripe integration needed — just a manual checkbox for cash collection on the night.

5. **Score entry** — Single gross score input per team. Net score auto-calculated as `gross - floor(combined_handicap)`. Leaderboard auto-sorts by net score ascending.

---

### Public Displays

1. **TV Embed — `src/pages/EmbedTVLocalComp.tsx`** at route `/embed/tv-local-comp`
   - Follows existing TV embed styling (orange/green Birdies branding, large text)
   - Shows active/most recent comp name, date, and leaderboard
   - Auto-refreshes every 30 seconds
   - Displays: Position, Team Name, Players, Gross, Net, with winner highlighted

2. **Birdies Hub leaderboard** — New section on the League Hub or Dashboard showing latest local comp results (read-only for members)

---

### Route & Navigation Additions

- Admin route: `/admin/local-comps` → `AdminLocalComps`
- TV embed route: `/embed/tv-local-comp` → `EmbedTVLocalComp`
- Sidebar nav item in `AdminLayout.tsx`
- Lazy imports in `App.tsx`

---

### Technical Details

- **Handicap formula**: Combined handicap = (Player 1 HCP + Player 2 HCP) / 4, stored as decimal, applied as floor for net calculation
- **Scoring**: Net = Gross - floor(combined handicap)
- **Winner**: Lowest net score wins; ties broken by lowest gross
- **Database**: 3 migrations for the new tables with RLS policies
- **No edge functions needed** initially — all logic is client-side with direct Supabase queries
- **Realtime**: Enable realtime on `local_comp_teams` for live TV leaderboard updates

### Files to Create/Modify
- **Create**: `src/pages/admin/AdminLocalComps.tsx`, `src/components/admin/local-comps/CompetitionList.tsx`, `src/components/admin/local-comps/ScoreEntry.tsx`, `src/components/admin/local-comps/CompResults.tsx`, `src/pages/EmbedTVLocalComp.tsx`
- **Modify**: `src/App.tsx` (routes), `src/components/admin/AdminLayout.tsx` (nav item)
- **Database**: 3 migration files for new tables + RLS + realtime publication

