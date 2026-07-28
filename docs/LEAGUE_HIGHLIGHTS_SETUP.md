# League Highlights Recorder — Pilot Bay Setup

The Bay Controller uses OBS Studio to record league rounds, splits them per hole
via ffmpeg, uploads the clips to Lovable Cloud storage, and tags highlights
automatically. Do this once on the pilot bay PC (recommended: the bay running an
RTX 5070).

## 1. Install OBS Studio (v30+)
- Download from https://obsproject.com/
- On first run, choose **"Optimize for recording"**.

## 2. Configure OBS
- **Settings → Output**:
  - Output Mode: `Advanced`
  - Recording Format: `mp4` (direct MP4 — no remux step; OBS 30+ writes a
    recoverable MP4, so the old crash-safety reason for MKV no longer applies)
  - Encoder: `NVIDIA NVENC HEVC` (or H.264 if HEVC unavailable)
  - Rate Control: `CQP`, CQ Level 28
  - Preset: `P4 - Balanced`
  - Recording Path: `C:\BirdiesRecordings`
- **Settings → Advanced → Recording**:
  - Leave **"Automatically remux recordings to MP4"** OFF — we already record
    direct to MP4 and the Bay Controller uploads that file straight to
    Cloudflare Stream via tus.
  - Note: OBS finishes writing the MP4 (moov atom + buffer flush) *after* it
    reports the recording has stopped, so the Bay Controller waits for the file
    size to settle before declaring the upload length to Cloudflare.

- **Settings → Video**:
  - Base + Output Resolution: `1920x1080`
  - FPS: `30`
- **Sources**: add a **Display Capture** for the GSPro monitor only.
- **Tools → WebSocket Server Settings**:
  - Enable WebSocket server
  - Port: `4455`
  - Set a strong password → paste it into Admin > Settings > Bay Management for
    this bay (field: `OBS WebSocket password`).

## 3. Enable auto-start
- Windows Startup: create a shortcut to `obs64.exe` with args
  `--minimize-to-tray --disable-shutdown-check`.

## 4. Turn on the pilot in Admin
Admin > SGT Manager > **Highlights** tab → **Pilot Bay** dropdown → select the
bay number → **Enable**.

Round-only recording (as of v2 of `sgt-highlight-poller`):
- The poller runs every ~60s and only starts OBS when the SGT embed shows
  the player has moved onto hole ≥ 1 of the active tournament.
- OBS stops the moment the embed shows `F` (round finished), the booking
  ends, or 20 minutes pass with no hole progress (abandoned).
- Back-to-back rounds within one booking each become a separate
  `recording_sessions` row (`round_number` auto-increments).
- Local Comp bookings (`[COMP]` tag in notes) start recording as soon as
  the booking is active and stop when the team's `net_score` is posted.
- Bookings that don't match either trigger produce zero recording and
  zero disk usage.

## 5. Retention
Raw recordings auto-purge 14 days after the tournament ends (via
`purge-old-recordings` daily cron). Approved clips in the review queue are kept.

