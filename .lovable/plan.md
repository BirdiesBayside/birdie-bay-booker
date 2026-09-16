# Sim Cup Live — bay streaming + public watch page

## The idea

A public page at `/sim-cup-live` built as an **overhead floor plan of Birdies**, not a
grid of boxes. You look down on the venue from above: six bay stalls along the hitting
line, the bar and lounge sketched in, the Birdies palette (base green, cream, orange).

- Each bay tile shows a **live thumbnail** of its stream (Cloudflare refreshes these
  automatically) with a pulsing orange LIVE dot when it's broadcasting, dimmed and
  labelled "Off air" when it isn't.
- Click a bay and the floor plan slides aside for the **big player** — vertical
  iPhone-style stream, player name and current score pulled from the Sim Cup
  registration/scorecard data, and the other bays reduced to a strip you can hop between.
- Under the floor plan: **Replays** — every finished stream, newest first, click to
  rewatch. Cloudflare saves each broadcast automatically, so this fills itself in.
- Desktop gets the plan view; on a phone it falls back to a stacked card list so it stays
  readable.

```text
  ┌──────────────── BIRDIES BAYSIDE ────────────────┐
  │  [BAY 1]  [BAY 2]  [BAY 3]  [BAY 4]  [BAY 5]    │
  │   LIVE     LIVE     off      LIVE     LIVE      │
  │                                                 │
  │        ░░ lounge ░░        ▓▓ bar ▓▓            │
  └─────────────────────────────────────────────────┘
```

## How the streaming works

1. **Cloudflare live inputs.** A one-off admin action creates a permanent live input per
   bay. Each returns an RTMPS key (goes to the bay PC) and a playback ID (used by the
   public page). Stored on `bay_devices` alongside the stream key field already added.
2. **No OBS changes at Birdies.** The bay app sets the stream destination over the OBS
   websocket (`SetStreamServiceSettings`) then calls `StartStream` / `StopStream`
   alongside the existing record commands. Existing scenes, vertical layout and 720p
   output are untouched; recording is unaffected.
3. **Sim Cup live switch.** A single venue-wide toggle in Admin → Settings → Bay
   Management. Off = bays behave exactly as today. On = bays start broadcasting when a
   session starts and stop when it ends, so normal customers are never broadcast.
4. **Consent line** on the Sim Cup pages and entry confirmation noting the event is
   streamed publicly.

## Technical notes

- Migration: add `cf_live_input_uid`, `cf_playback_id`, `cf_rtmps_url` to `bay_devices`;
  add `sim_cup_live_enabled` to `system_settings`. Public read of the playback fields via
  a restricted view/policy so the watch page needs no login.
- New edge function `cf-live-inputs`: admin-only; creates or refreshes the Cloudflare live
  input per bay using the existing Cloudflare account/token secrets, writes the UIDs back.
- `electron/obs-controller.js`: add `setStreamSettings(url, key)`, `startStream()`,
  `stopStream()`, `getStreamStatus()`; matching IPC handlers in `electron/main.js`.
- `src/pages/BayController.tsx`: when the Sim Cup toggle is on and the bay has a key,
  start the stream with the recording and stop it at session end (existing hard-stop path).
- `src/pages/SimCupLive.tsx` + route in `src/App.tsx`, using Cloudflare's iframe player and
  thumbnail URLs. Live status polled from the Cloudflare live-input status via a small
  public edge function so viewers see accurate LIVE badges.
- Link from `/sim-cup` and `/sim-cup-confirm`.

## Not included

- No change to OBS scenes, resolution or bitrate.
- No streaming of non-Sim-Cup sessions.
