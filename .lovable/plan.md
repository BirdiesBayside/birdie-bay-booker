# Round-Only Recording

Recordings only run while a player is actively in a scored round. No more full-booking captures.

## Trigger rules

**League (SGT) bookings**
- Booking becomes active AND `sgt_user_id` is set → start polling every 60s (no OBS yet).
- Poller sees the player on hole ≥1 (or "F") for the first time in the active tournament → send `start_recording` to Bay Controller, create a `recording_sessions` row labelled "Round 1".
- Poller sees "F" for that round → send `stop_recording`, mark row `pending_split`, upload begins.
- Polling continues for the rest of the booking. If the player starts a new tournament round, repeat → "Round 2", etc.
- Abandoned round: 20 min with no hole progress and no "F" → auto-stop, upload whatever we have.
- Booking ends mid-round → auto-stop, upload partial, label "Round N (partial)".

**Local comp bookings**
- Booking active AND a local comp is scheduled today AND at least one player on the booking is on a `local_comp_teams` row for that comp → start polling.
- Poller watches `local_comp_teams.net_score` for that team. When it flips from NULL → set → send `stop_recording`, upload as "Local Comp Round".
- Recording starts on first poll after booking becomes active (we have no per-hole signal for local comp, so we accept the full round window here — still bounded by booking length).

**Everything else**: no polling, no recording. Zero disk usage.

## Removals
- Delete the current "record entire booking" flow in `BayController.tsx` (OBS start on booking-active, stop on booking-end).
- Remove the safety-net that stamps hole 18 on stop — no longer relevant.
- Keep hole timeline poller (`sgt-highlight-poller`) but repurpose it to also drive start/stop commands.

## Data model
- `recording_sessions`: add `round_number int`, `trigger_source text` ('sgt' | 'local_comp'), `partial boolean default false`.
- New `bay_commands.command_type` values: `obs_start_recording`, `obs_stop_recording` (Bay Controller already listens to `bay_commands`).

## Files touched
- `supabase/functions/sgt-highlight-poller/index.ts` — extend to emit start/stop, track per-booking round state, add local-comp branch.
- `supabase/functions/bay-controller-api/index.ts` — remove auto-start on booking-active; keep `recording_stop` endpoint for the poller-driven stop.
- `electron/main.js` — handle new `bay_commands` for OBS start/stop; drop the time-based OBS triggers.
- `src/pages/BayController.tsx` — remove OBS start/stop hooks tied to booking lifecycle.
- Migration for the new columns.
- `docs/LEAGUE_HIGHLIGHTS_SETUP.md` — update to reflect round-only capture; recommend 30fps CQP 26.

## Not changing
- Cloudflare upload/split pipeline.
- Highlights tagger.
- Existing bay_devices / OBS websocket setup.

Est. one migration + ~5 file edits. Ready to build on approval.
