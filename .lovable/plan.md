# Bay 6 plug-off blind spot — hardening

## What happened (confirmed from logs)
- IP fix worked: plug ON at 8:57pm succeeded 2/2 (both 192.168.4.76 and .107).
- At 10:00:00pm Brisbane the controller decided plug_off after the final booking ended; process check passed.
- No plug-off result (success or failure) was ever logged, and bay 6 has logged nothing since (~9h silence).

## Goal
Make plug-off outcomes and controller silence visible, so a misfire can never go unnoticed again.

## Changes

### 1. Guaranteed plug-off result logging (Bay Controller app)
- Wrap the plug-off path so a `plug_control_result` (or error) log is always emitted, even if a plug times out or the command throws.
- Flush logs immediately after plug-off completes (don't rely on the batch queue at end of session).

### 2. Plug-off retry
- If a plug fails to respond on plug-off, retry up to 2 times with a short delay; log each attempt and the final outcome.
- If still failing, log an `error` level entry naming the plug and IP so it shows clearly in Admin → Bay Controller Logs.

### 3. Controller silence indicator (Admin → Bay Control)
- Show a "last heard from" timestamp per bay based on the latest bay_controller_logs entry (and/or heartbeat if present).
- Flag any bay idle beyond a threshold (e.g. no logs during open hours while a booking was expected) with a warning badge — no notifications, just visibility in the admin UI.

## Technical notes
- App side: `src/pages/admin/AdminBayControl.tsx` / BayController plug control path where `logPlugControlResult` is called; ensure the plug-off branch awaits and always logs.
- Admin side: `AdminBayControl.tsx` / `BayControllerLogs.tsx` — small query for max(created_at) per bay.
- No database schema changes expected. No changes to plugs, network, or Tapo config — the IP reservation fix stays as the user's manual step.

## Out of scope
- Reworking the scheduler, state machine, or booking logic.
- Automatic IP re-discovery of plugs (can be a follow-up if the .76 address moves again).
