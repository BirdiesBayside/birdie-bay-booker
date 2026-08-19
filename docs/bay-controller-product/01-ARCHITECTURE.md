# 01 — Architecture

How the Bay Controller works today. This is the behaviour the product must preserve.

## Processes and files

| Piece | File | Role |
| --- | --- | --- |
| Main process | `electron/main.js` (~4,200 lines) | Windows automation: plugs, process launch/kill, window positioning, welcome/notification windows, kiosk shell swap, global hotkeys, file watching, auto-update |
| IPC bridge | `electron/preload.js` | Exposes `window.electronAPI` — the only surface the renderer can use |
| Renderer | `src/pages/BayController.tsx` (~4,800 lines) | Scheduler, state machine, UI, backend polling and realtime |
| Renderer entry | `src/bay-controller-main.tsx` + `bay-controller.html` | Standalone React root, built by `vite.config.electron.ts` into `dist-electron-app` |
| Plug binary | `electron/tapo_control.py` → `tapo_control.exe` | Login / on / off / status / diagnose for TP-Link Tapo P110 |
| Watchdog | `electron/watchdog.bat` | Windows Task Scheduler job, every 30s, restarts the app if closed |
| Types | `src/types/electron.d.ts` | Typed contract for every IPC channel |

**One instance only.** Two instances produce conflicting precision-scheduler actions
(double launches, fighting plug commands). Enforce single-instance lock; the watchdog only
restarts when nothing is running.

**WebViews load the hosted web app**, not a bundled copy. The only hardcoded HTML in the
desktop app is the Welcome Window. That means most UI changes ship without a new installer.

## IPC channel groups (current)

- **Plugs:** `tapo-init`, `tapo-test-login`, `control-plug`, `diagnose-plug`
- **Displays & windows:** `get-displays`, `get-display-device-paths`, `find-window`,
  `move-window`, `minimize-window`, `focus-window`, `list-windows`,
  `check-window-positions`
- **App lifecycle:** `launch-app`, `run-app-sequence`, `cancel-app-sequence`, `close-apps`,
  `check-processes`, `is-gspro-running`, `get-gspro-launch-ts`
- **Customer-facing windows:** `show-welcome-windows`, `close-welcome-windows`,
  `show-notification-popup`, `close-notification-popup`
- **Settings restore:** `browse-gspro-folder`, `set-gspro-folder`, `browse-baseline-file`,
  `save-baseline-file`, `set-baseline-enabled`, `restore-baseline-now`,
  `get-baseline-config`, `read-gspro-user-settings`, `write-gspro-user-settings`,
  `capture-user-settings-snapshot`
- **Security:** `set-kiosk-mode`, `set-authenticated`, `confirm-quit`
- **Convenience:** `copy-for-paste`, `trigger-auto-paste`, `get-auto-paste-status`,
  `clear-auto-paste`
- **Updates:** `check-for-updates`, `install-update`, `get-app-version`

Channels to drop in v1 (Birdies-only): all `obs-*`, all `sgt-*` overlays,
`capture-scorecard-screenshot`, `read-protee-current-screen`, `set-protee-display`,
`scan-desktop-csvs`, `delete-desktop-csv`.

## Automation timeline

Relative to session start / end:

| Time | Action |
| --- | --- |
| T-3m | Smart plug ON — PC and simulator hardware boot |
| T-3m | Settings restore: shared baseline, then this player's own snapshot |
| T-1m | Launch simulator software and position windows |
| T-0 | Welcome window shown with the player's first name |
| In-session | 5-minute and 1-minute warnings as always-on-top popups |
| End-3m | Capture the player's current settings files, upload to their profile |
| End-20s | Close simulator apps |
| End+0 | Smart plug OFF |

**Back-to-back sessions bypass** the End-20s close and End+0 power-off. A 5-second
intentional cooldown separates state transitions.

## State machine

Automation is an explicit state machine (`IDLE`, `PRE_START`, `RUNNING`, `CLOSING`), not a
pile of ad-hoc timers. The scheduler computes absolute wall-clock action times from the
session rows and schedules precise callbacks; every callback re-validates against live data
before it acts (see `02-RELIABILITY-RULES.md`).

## Control modes

Each bay is `auto` or `manual` (`bay_devices.control_mode`). Manual disables all scheduled
actions so staff can work on the PC. Mode changes are delivered by INSERT into a commands
table with Realtime **plus** a polling fallback and a heartbeat echo — Realtime alone
proved unreliable.

## Heartbeat and logging

The controller heartbeats to the backend every cycle: it upserts `is_online`, `last_seen`
and `app_version`, and receives the authoritative `control_mode` in the response. Every
scheduled action also writes a high-precision `local_timestamp` log entry. **Logs are the
first place to look for any automation complaint** — they carry both server and local
clock values, which is how clock-drift and throttling bugs were found.

## Kiosk mode

Locks the Windows PC to the simulator experience for the duration of a session; staff
unlock with a code. Implemented by swapping the shell and suppressing quit paths
(`set-kiosk-mode`, `confirm-quit`, `set-authenticated`).

## Settings restore (two layers)

1. **Shared baseline** — the venue's known-good simulator settings files.
2. **Player snapshot** — the files captured at the end of that player's last session,
   stored against their account.

The restore runs **before every launch**, automated or staff-triggered. Baseline files are
deliberately **not** restored when the simulator closes — doing so wiped customer settings.
