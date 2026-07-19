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
  - Recording Format: `mkv`
  - Encoder: `NVIDIA NVENC HEVC` (or H.264 if HEVC unavailable)
  - Rate Control: `CQP`, CQ Level 22
  - Preset: `P4 - Balanced`
  - Recording Path: `C:\BirdiesRecordings`
- **Settings → Video**:
  - Base + Output Resolution: `1920x1080`
  - FPS: `60`
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
bay number → **Enable**. All new League bookings on that bay will trigger:
- OBS starts recording when the customer's booking becomes active
- Per-shot CSV is watched to build the hole timeline
- OBS stops on session end; ffmpeg splits into per-hole clips
- Clips upload to the private `league-highlights` bucket
- `sgt-highlight-tagger` scans holes hourly for highlights (birdies, eagles,
  hole-outs, darts, 300m+ drives). Review queue is in the Highlights tab.

## 5. Retention
Raw recordings auto-purge 14 days after the tournament ends (via
`purge-old-recordings` daily cron). Approved clips in the review queue are kept.
