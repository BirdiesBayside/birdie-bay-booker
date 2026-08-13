# Bay Controller recording: confirm and ship the final fix

## Where things stand

The two failure modes we've seen are now both covered in code:

1. **Runaway recordings (4–5 hours)** — the hard-stop watchdog finalises a recording when its booking ends, so a recording can never outlive its session.
2. **Lost recordings ("OBS not connected")** — the stop path now rebuilds the OBS connection from the bay's saved URL/password before stopping, so a dropped control socket during a long round no longer abandons a completed video.

Both paths funnel through a single stop call site in `BayController.tsx` (`finalizeRecording`), which means the reconnect logic applies to the normal end-of-session stop, the hard-stop watchdog, and the orphan reaper alike. No chunking risk: reconnecting is control-plane only, and the start handler reuses an in-progress recording rather than starting a second one.

## Remaining work

This is a release and verification task, not new logic.

1. **Ship the update to the bay PCs.** Version bump and release so the reconnect fix is actually running on Bays 1–6. Until every bay is updated, Bays 3 and 6 can still lose rounds the same way.
2. **Confirm all bays are on the new build.** Check the version shown in each bay's controller UI after the auto-update lands.
3. **Verify on the next comp night.** Expect one recording session per round, all reaching uploaded state, each a single continuous file.

## Technical notes

- Stop handler: `electron/main.js` → `obs-stop-recording` (rebuilds controller via `ensureObs`, reconnects when not identified, then `StopRecord` + `waitForStableSize`).
- Start handler reuses an active recording under 5 minutes old and only discards recordings older than that as strays — so a reconnect never produces a second file.
- Failed stops are now marked `failed` rather than `executed`, so a repeat of this issue shows up in the command log instead of looking successful.
- No database or edge function changes are needed.
