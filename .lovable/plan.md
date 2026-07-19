# League Highlight Recorder — Pilot (One Bay, No Consent)

Goal: On the pilot bay, continuously record GSPro during confirmed League tournament bookings, split the footage into per-hole clips using the shot CSV we already watch, auto-tag every hole against a rules engine driven by SGT live data, and surface highlight candidates in Admin with a shot-timeline scrubber for one-click social clip export.

RTX 5070 + NVENC = zero performance risk to GSPro. No customer opt-in required (our equipment, our terms).

## Recording pipeline (Bay Controller)

Add OBS Studio + `obs-websocket` to the pilot bay only, controlled by the existing Electron app.

OBS profile (pre-configured, committed as JSON in the repo):

- Capture: GSPro monitor only
- Encoder: NVENC H.264, 1080p60 downscaled from 4K, CBR 8 Mbps, no audio
- Output: `C:\BirdiesRecordings\raw\bay<N>_<bookingId>_<startISO>.mkv` (one file per booking, ~5.5GB per 18-hole round)

Flow in `electron/main.js` + `BayController.tsx`:

1. Booking becoming active AND `bay_number = pilot` AND booking is a League tournament round → `StartRecord` via obs-websocket
2. Booking end OR GSPro close → `StopRecord`
3. Write a `recording_sessions` row (booking_id, bay_number, sgt_user_id, sgt_tournament_id, mkv_path, started_at, ended_at, status)
4. On stop → kick the local hole-splitter (see below)

If OBS fails to start we log an error and continue — bookings are never blocked by the recorder.

## Hole splitting (Bay Controller, using the CSV we already watch)

We already have `fs.watch` on the desktop CSV export folder. Extend the existing watcher:

1. On each new CSV row for the active session, capture `{ hole_number, shot_number, mtime_ms }` into an in-memory `shotTimeline` for that recording session.
2. When the recording stops, we have `recording_started_at` (from OBS) + the full shotTimeline.
3. Group shots by hole. For each hole: `hole_start = first_shot.mtime − 15s`, `hole_end = last_shot.mtime + 20s` (buffer for setup + reaction).
4. Convert absolute mtimes to seconds-since-recording-start.
5. Use bundled `ffmpeg-static` to lossless-cut the MKV per hole: `ffmpeg -ss <start> -to <end> -i raw.mkv -c copy hole_<N>.mkv`. Instant, no re-encode.
6. Upload only the holes that trigger a highlight rule (see next section) to Supabase Storage.
7. Raw MKV kept locally 24h as fallback, then auto-deleted.

Fallback if CSVs are missing (customer never exported): mark the recording as `unsplit` and keep the raw MKV for 48h so admin can manually clip if desired.

## Highlight detection (SGT-driven rules engine)

New edge function `sgt-highlight-tagger` (cron every 5 min during active league windows, service-role, bypasses RLS).

For each `recording_sessions` row with status `pending_tagging`:

1. Fetch player's full scorecard via existing `sgt-api` `live-scorecard` action → per-hole stats including proximity, driving distance, putt distance, GIR, fairways.
2. Run every hole through the rules engine below.
3. For each rule hit, insert a `highlight_events` row: recording_session_id, hole_number, rule_key, tag_label, tag_emoji, shot_index (which shot in the hole triggered it, if applicable), sgt_metric_value.
4. Set the corresponding hole's status in `recording_holes` to `pending_review` so the Bay Controller uploads it.

**Rules engine (v1):**


| Rule key              | Trigger                             | Tag          |
| --------------------- | ----------------------------------- | ------------ |
| `eagle_or_better`     | score − par ≤ −2                    | 🦅 Eagle     |
| `birdie`              | score − par = −1                    | 🐦 Birdie    |
| `hole_out_distance`   | any non-final shot holed from ≥ 30m | 🎯 Hole-out  |
| `long_approach_stick` | approach ≤ 3m from ≥ 140m           | 🎯 Dart      |
| `monster_drive`       | driving distance ≥ 300m             | 💥 Bomb      |
| `long_putt_made`      | putt ≥ 10m holed                    | 🎱 Long putt |
| `scramble_save`       | missed GIR + par or better          | 🏖️ Save     |
| `near_ace`            | par 3 + approach ≤ 2m               | 🎯 Near-ace  |
| `hole_in_one`         | par 3 + score = 1                   | 🏆 HIO       |


Rules are stored as a config constant in the edge function so we can add/tune easily. A hole can trigger multiple tags — all are stored.

**Answers the "8 from 180m" case:** `hole_out_distance` fires on the shot, independent of final score.

## Upload + storage

Bay Controller uploads only tagged holes to a new private bucket `league-highlights`, path `raw-holes/<recording_session_id>/hole_<N>.mkv`. Approved final clips get written to `approved/<slug>.mp4` in the same bucket.

## Admin review UI

New tab: **Admin → SGT Manager → Highlights**.

List view (default: last 7 days, filterable by tournament):

- Card per highlight event, grouped by hole
- Player, tournament, hole, all tags with emojis, score summary
- Inline `<video>` element loading the hole MKV via signed URL

Below each video:

- **Shot timeline strip** — one clickable dot per shot in the hole, spaced by their relative timestamps in the recording. Hover shows shot distance. Click to jump the player to that shot's start (−5s buffer).
- **Trim controls** — "Set clip start" / "Set clip end" buttons that read the current player time, plus preset buttons: "±15s around this shot", "±30s around this shot", "Whole hole".
- **Actions:** Save clip (re-encodes to MP4 via `cut-league-highlight` edge function using ffmpeg from `ffmpeg-static`, uploads to `approved/`), Reject (soft-delete, purges hole MKV after 7 days), Download MP4.

## Technical details

**New tables (migration):**

```sql
-- Recording sessions (one per booking)
CREATE TABLE public.recording_sessions (
  id uuid PK,
  booking_id uuid REFERENCES bookings,
  bay_number int NOT NULL,
  sgt_user_id text,
  sgt_tournament_id text,
  mkv_path text,           -- local path on bay PC
  started_at timestamptz,
  ended_at timestamptz,
  status text DEFAULT 'recording',  -- recording|pending_split|pending_tagging|tagged|error|unsplit
  error_message text,
  created_at timestamptz DEFAULT now()
);

-- One row per hole in a recording
CREATE TABLE public.recording_holes (
  id uuid PK,
  recording_session_id uuid REFERENCES recording_sessions ON DELETE CASCADE,
  hole_number int,
  par int,
  score int,
  clip_start_seconds numeric,   -- offset in raw MKV
  clip_end_seconds numeric,
  storage_path text,             -- null until uploaded
  shot_timeline jsonb,           -- [{shot_index, offset_seconds, distance_m, club}]
  status text DEFAULT 'pending_tag',  -- pending_tag|no_highlight|pending_review|approved|rejected
  UNIQUE(recording_session_id, hole_number)
);

-- One row per rule hit (a hole can have multiple)
CREATE TABLE public.highlight_events (
  id uuid PK,
  recording_hole_id uuid REFERENCES recording_holes ON DELETE CASCADE,
  rule_key text,
  tag_label text,
  tag_emoji text,
  shot_index int,
  metric_value numeric,
  created_at timestamptz DEFAULT now()
);

-- Approved final clips
CREATE TABLE public.highlight_clips (
  id uuid PK,
  recording_hole_id uuid REFERENCES recording_holes,
  storage_path text,
  duration_seconds numeric,
  approved_by uuid REFERENCES auth.users,
  approved_at timestamptz,
  tags text[],
  player_name text,
  tournament_name text
);
```

All get GRANTs to `authenticated` + `service_role`, RLS admin-only.

**New storage bucket:** `league-highlights` (private).

**New/changed edge functions:**

- `sgt-highlight-tagger` — cron every 5 min, runs the rules engine on `pending_tagging` sessions
- `cut-league-highlight` — invoked from admin UI, ffmpeg-trims a hole MKV to the requested start/end and uploads MP4
- `recording-signed-url` — generates short-lived signed URLs for the admin video player

**Bay Controller changes (`electron/main.js` + `BayController.tsx`):**

- New module `electron/obs-controller.js` (obs-websocket-js)
- New module `electron/hole-splitter.js` (uses shotTimeline + ffmpeg-static)
- Bundle `ffmpeg-static` and `obs-websocket-js` in `electron/package.json`
- Gated by `bay_number === PILOT_BAY_NUMBER` const + `RECORDING_ENABLED` env flag; other 5 bays completely unaffected
- New IPC: `recording-start`, `recording-stop`, `hole-split-complete`

**Cron:**

```sql
select cron.schedule('sgt-highlight-tagger', '*/5 * * * *', $$...$$);
```

## Rollout gates (before expanding beyond pilot bay)

- ≥ 20 league sessions recorded without GSPro frame-time regression (baseline vs recording measured by Windows perf counters logged to `bay_controller_logs`)
- ≥ 90% of eagles/birdies successfully clipped
- Zero booking flow disruptions in the pilot period
- Admin review flow used at least 10 times end-to-end (clip → approve → download)

## What we're NOT doing in v1

- No non-league bookings recorded
- No changes to the other 5 bays
- No audio capture
- No ML / vision-based shot detection
- No auto-posting to socials (human approval required)
- No customer-visible "your highlights" page (that's v2 — same data, just re-scoped RLS)

## Build order

1. **Recording infrastructure** — OBS install, `obs-websocket` control, `recording_sessions` table, start/stop wired to bookings on pilot bay. Verify with a manual league round.
2. **Hole splitter** — extend CSV watcher, ffmpeg cut, `recording_holes` populated, holes uploaded to storage.
3. **Rules engine + admin UI** — `sgt-highlight-tagger` cron, `highlight_events` table, Highlights tab with shot-timeline scrubber and clip export.

Manual test between each chunk.  
  
In terms of keeping the screen recordings. We should just have a rule where the current week is maintained and kept for a week after the tournmanet ends. So essentially when a weekly round finishes on sunday, we have the entire next week to play around with highlights, then they delete themselves from the bays when the next tournenate starts

&nbsp;