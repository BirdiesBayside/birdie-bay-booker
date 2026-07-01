# Plan: Range Session Data + Per-Customer GSPro Continuity

Three linked pieces, all triggered from the existing "GSPro close" automation in the Bay Controller.

## 1. Bay Controller — on GSPro close

Extend the existing baseline-restore hook in `electron/main.js` so, before restoring the shared baseline files, it does the following in order for the **active booking's customer** at that bay:

1. **Save per-customer GSPro settings snapshot**
  - Read the current `dpsV2x3.gss` and `Settings.vgs` from the GSPro folder.
  - Upload both to Cloud Storage bucket `gspro-user-settings/{user_id}/dpsV2x3.gss` and `.../Settings.vgs` (overwrite each session so it's always the latest).
2. **Scan Desktop for new range CSVs**
  - Watch `%USERPROFILE%\Desktop` for `*.csv` files created/modified since GSPro launched this session (track launch timestamp when we spawn GSPro).
  - Validate each as a GSPro range export (header sniff: expected columns like ClubType, BallSpeed, ClubSpeed, SmashFactor, LaunchAngle, LaunchDirection, SpinRate, SpinAxis, Carry, Total, Side, etc.).
  - For each valid CSV: POST to new edge function `ingest-range-session` with `{ user_id, booking_id, bay_id, csv_base64, filename }`. On 200 OK, delete the CSV from Desktop. On failure, leave the file and log — retry next close.
3. **Restore baseline** (existing behavior) so next customer starts clean if they have no snapshot yet.

**Customer resolution:** reuse the same "active booking at this bay" lookup the SGT overlay currently uses. If no active booking (walk-in / staff testing), skip both uploads and skip baseline restore of user settings (baseline still runs).

Players messing with settings will ultimately have those settings replaced next time they're in, which is great, always saves their names and settings. We must however always remember the baseline file gets replaced if the customer has no current settings file associated with then

## 2. Bay Controller — on GSPro launch (per-customer settings injection)

In the existing pre-launch sequence, **after** baseline restore but **before** spawning `GSPro.exe`:

- Look up active booking's `user_id`.
- If `gspro-user-settings/{user_id}/dpsV2x3.gss` and `Settings.vgs` exist in Cloud Storage, download and overwrite the two files in the GSPro folder.
- If either is missing (first-ever session), leave the baseline in place — customer will get the shared login for this one session, and their snapshot will be captured on close.

This makes SGT login and GSPro preferences persistent across sessions.

**SGT icon overlay removal:** delete SGT icon/info overlay windows, IPC, hotkeys (F7/F9 icon toggles stay for info overlay only if we want, otherwise removed), and the `sgtIconClicked/Hidden` plumbing in `electron/main.js`, `preload.js`, `src/types/electron.d.ts`, `SGTIconButton.tsx`, `SGTPlayerOverlay.tsx`. Bay Controller admin UI loses the SGT icon settings block.

## 3. Backend — ingest + storage

**New storage bucket** `gspro-user-settings` (private, RLS: users read their own, service role write).
**New storage bucket** `range-session-csv` (private, archives raw CSV per session for reprocessing).

**New table `range_sessions**`

- `id`, `user_id` (fk profiles.user_id), `booking_id` (fk bookings, nullable), `bay_id`, `session_date`, `csv_path`, `shot_count`, `duration_minutes`, `created_at`.
- Standard grants (`authenticated` SELECT own, `service_role` ALL). RLS: `user_id = auth.uid()` OR admin.

**New table `range_shots**`

- `id`, `session_id` (fk cascade), `shot_number`, `club_type`, `ball_speed`, `club_speed`, `smash_factor`, `launch_angle`, `launch_direction`, `spin_rate`, `spin_axis`, `back_spin`, `side_spin`, `carry`, `total`, `side_carry`, `side_total`, `apex_height`, `descent_angle`, `angle_of_attack`, `club_path`, `face_angle`, `face_to_path`, `shot_timestamp`.
- Indexed on `(session_id)` and `(session_id, club_type)`. Same RLS pattern via join to `range_sessions`.

**New edge function `ingest-range-session**`

- Auth: shared bay-controller secret header (like existing bay endpoints).
- Parse CSV (Deno CSV lib), upsert `range_sessions` row, bulk insert `range_shots`, archive raw CSV to `range-session-csv/{user_id}/{session_id}.csv`.

## 4. Customer Hub — Range Sessions section (Trackman-style)

New route `/range` in the Hub (link in main nav next to League/Bookings). Uses shared design tokens — Anton headings, base green `#1F4C25`, orange `#EC622D` accents.

**Overview tab**

- KPI cards: total sessions, total shots, avg ball speed, avg smash factor, longest carry, most-used club.
- Trend chart (last 20 sessions): avg carry per session, colored per club.

**Club Gapping tab**

- Per-club table: shots, avg/max carry, avg/max total, avg ball speed, avg spin, avg launch, dispersion (lateral SD).
- Bar/whisker chart of carry by club (Trackman-style gapping chart).

**Dispersion tab**

- Per-club scatter plot: side vs carry, with 1σ ellipse. Filter by club and session range.
- Shot trails (top-down view) rendered with SVG.

**Sessions tab**

- List of sessions (date, bay, shot count, duration, top clubs used). Click into session detail.
- **Session detail:** shot-by-shot table (sortable), per-club summary for that session, dispersion plot, ability to filter clubs.

**Consistency tab**

- Strike consistency score per club (smash factor SD, launch angle SD).
- Session-over-session comparison picker (two sessions side by side).

Charts: Recharts (already in stack). Ellipse math client-side.

## 5. Rollout order

1. Migration: tables + buckets + grants + RLS.
2. Edge function `ingest-range-session` + tests.
3. Bay Controller: capture-on-close (CSV upload + settings snapshot) — shipped in next Electron build.
4. Bay Controller: settings injection on launch + SGT overlay removal — same build.
5. Hub `/range` section — Overview + Sessions first, then Gapping/Dispersion/Consistency in follow-up commits within same milestone.

## Open items to confirm during build

- CSV column names/order in a real GSPro range export — will confirm from a sample file before finalizing parser (safe fallback: store all columns as JSONB alongside typed columns).
- Whether admins should see any customer's range data in Admin → Customers (assume yes, read-only tab).

## Technical notes

- Storage bucket creation via `supabase--storage_create_bucket` (private).
- Bay Controller CSV upload uses same shared secret pattern as `bay_commands` endpoints; no user JWT on the bay PC.
- Range shot ingest batched (single insert with array) to keep function under time limit — GSPro range sessions rarely exceed a few hundred shots.
- File watcher not needed since we only sweep on GSPro close per your answer.
- SGT overlay removal is a hard delete, not a feature flag, per your confirmation.