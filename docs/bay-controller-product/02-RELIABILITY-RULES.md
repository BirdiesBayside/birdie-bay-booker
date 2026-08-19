# 02 — Reliability Rules (port these verbatim)

Every rule below exists because something failed in production. Re-implement each one in the
new product; do not "simplify" them.

## Scheduling

- **Just-in-time validation.** Timed callbacks must re-read the live sessions ref at fire
  time, never close over the session object captured when the timer was set. A cancelled or
  rescheduled session must not trigger a phantom launch.
- **Back-to-back launch guard.** Guard launches with `isAfter(now, appLaunchTime)`. Without
  it, the gap between consecutive sessions produced phantom launches.
- **Plug-off safety net.** A separate polling effect turns plugs OFF whenever `shouldBeOn`
  is false. The scheduler clears its timer Map on cleanup. This catches reschedules and
  cancellations the scheduler already discarded.
- **Changeover grace period.** Allow a 3-minute grace window at changeover before any
  watchdog treats a bay as idle, otherwise a legitimate handover looks like a crash.
- **5-second intentional cooldown** between state transitions so a close and a launch never
  race.

## Launching and windows

- **Launch-loop protection.** 3 failed display-detection retries triggers a 60-second
  lockout. Without it the app relaunched the simulator in a tight loop.
- **Display warm-up.** 90-second warm-up delay before positioning; 3 positioning retries;
  `Win+Shift+Arrow` as a fallback when the Win32 move fails.
- **No active repositioning after the initial placement** — it fought the user.
- **Window-based kill.** `closeApps()` kills any process that owns a visible window matching
  a whitelist, rather than an exact binary name. A renamed simulator exe used to survive
  shutdown.
- **Reset simulator config on close / manual reposition (F10)** to clear the single-monitor
  window-position bug.

## Settings

- **Restore before every launch**, whichever path triggered the launch (schedule, staff
  close-and-reopen, F10).
- **Never restore the baseline on simulator close.** It destroyed the player's settings
  before capture.
- **Capture at End-3m, not at close** — a power cut or crash at the end of a session must
  not lose the snapshot.
- Compare against the baseline hash client-side so only genuinely modified files upload.

## Modes and connectivity

- **Mode sync by command rows + polling + heartbeat echo.** Realtime alone dropped messages
  and stranded bays in Manual. The heartbeat response carries the authoritative
  `control_mode`; the client reconciles on every beat.
- **Cache the day's sessions on disk.** An internet outage must not stop already-scheduled
  automation from running.

## Crashes and timers

- **Crash recovery:** 1.5-second reload cooldown on `render-process-gone`, appended to a
  local crash log.
- **Chromium background throttling is real.** When the display sleeps, Electron timers
  freeze — this once produced a 4-hour recording. Any long-running operation needs a hard
  stop computed from wall-clock time, not from an interval that assumes it kept ticking.
- **Single instance is mandatory.** Two instances = conflicting scheduler actions.
- **Watchdog** (Task Scheduler, 30s) restarts the app only if it is not running.

## Timezone

All scheduling and every displayed time must use the venue's configured IANA timezone
explicitly, via helper functions. Never call bare `toLocaleString()` and never rely on the
PC's local timezone: bay PCs get imaged in one region and shipped to another.

## Idempotency

Any write triggered by an external event (session upsert, log batch, snapshot upload) must
be idempotent on a stable key. Duplicate delivery is normal, duplicate side effects are not.
