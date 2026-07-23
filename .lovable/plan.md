# Rework App Restore Flow

## New behaviour

**Pre-launch (before GSPro opens):**
1. If the customer has a saved snapshot in storage → copy their `dpsV2x3.gss` + `Settings.vgs` into the configured GSPro folder.
2. If no snapshot exists (or booking has no `user_id`) → copy the shared baseline files instead.
3. Launch GSPro.

**T-3 minutes before session end:**
- Read the current `dpsV2x3.gss` + `Settings.vgs` from the GSPro folder and upload them as the customer's snapshot. **Always upload — no hash comparison.** Latest file wins.

**On GSPro close:**
- Range CSV upload still runs (unchanged).
- No baseline restore.
- No snapshot capture.

**Back-to-back changeover (T-60s):**
- Close apps → restore incoming customer's snapshot (or baseline fallback) → relaunch. No baseline sweep between customers.

## App Restore toggle behaviour

The single "Enable App Restore" toggle in the Bay Controller UI is the master switch for the entire feature.

- **ON**: All logic above runs — pre-launch snapshot/baseline restore, T-3min capture, changeover snapshot swap.
- **OFF**: Nothing is copied, nothing is captured. GSPro launches against whatever is currently on disk. Range CSV upload still runs on close (that's separate).

Baseline file upload UI and GSPro folder path config remain exactly as they are today — those are needed to seed the fallback and tell the app where to write files.

## Changes

**`electron/main.js`**
- Remove the 2s `restoreBaselineFiles()` call inside the `gspro-closed` branch of the process watcher. Keep the `gspro-closed` IPC (renderer needs it for range CSV upload).
- Keep `restoreBaselineNow`, baseline upload, and folder path IPC handlers as-is.

**`src/lib/range-sync.ts` (`saveUserGsproSettings`)**
- Remove hash-comparison / skip-if-unchanged logic. Always read the files and upload — overwrite the customer's stored snapshot every time.

**`src/pages/BayController.tsx`**
- Gate the whole restore/capture chain behind the App Restore toggle (`baselineConfig.enabled`). When OFF, skip pre-launch restore, T-3min capture, and changeover snapshot swap.
- Pre-launch (Step A/B): try customer snapshot first; only fall back to `restoreBaselineNow()` if no snapshot exists or booking has no `user_id`. (Today it always applies baseline then overlays snapshot — the baseline pass becomes fallback-only.)
- Changeover: same snapshot-first / baseline-fallback logic. Drop the "close apps to trigger baseline reset" intent — closing is only to reset GSPro cleanly.
- Remove the snapshot-upload call from `runSwingLabCloseSync`. Keep the range CSV upload half.
- Add a **T-3min capture timer** when a booking becomes active: schedules `saveUserGsproSettings(userId)` to fire 3 minutes before `end_time`. Guarded against duplicates, rescheduled if the booking's `end_time` changes (extensions), cleared on unmount / booking change / early end.

**App Restore UI card (`BayController.tsx` settings section)**
- Rename toggle to **"Enable App Restore"** with helper text describing the new flow: *"Restores each customer's own GSPro settings before launch (or baseline files as fallback), and captures their latest settings 3 minutes before their session ends."*
- Remove the old "Auto-Restore Baseline on GSPro Close" label. Baseline upload + GSPro folder path controls stay.

## Edge cases

- **Session shorter than 3 minutes remaining when it starts** (e.g. late launch): T-3min already passed → skip capture, log it.
- **Booking extended**: `end_time` changes → reschedule the T-3min timer to the new value.
- **Customer closes GSPro before T-3min**: no capture this session; they keep their previous snapshot.
- **Walk-in / no `user_id`**: skip capture, use baseline for launch.
- **App Restore toggle OFF**: no restore, no capture, no baseline touches — pure passthrough.
