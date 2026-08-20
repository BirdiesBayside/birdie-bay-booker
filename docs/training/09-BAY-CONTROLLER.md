# 09 — The Bay Controller

Reference: `docs/platform/02-BAY-CONTROLLER.md`, `docs/platform/09-BAY-CONTROLLER-BUILD.md`, and the
product pack in `docs/bay-controller-product/**`

This is the piece that makes an unstaffed venue possible, and the piece clients are most impressed
by. It is also the piece that is hardest to debug, because it runs on a PC in a room you're not in.

## What it is

A Windows desktop app (Electron) installed on each bay PC. It logs in, learns which bay it is,
reads that bay's schedule, and then acts on the clock — with nobody present.

## The timeline

| Time | What happens |
| --- | --- |
| T-3m | Smart plug ON — the PC and simulator hardware boot |
| T-3m | Settings restored: venue baseline first, then this player's own saved settings |
| T-1m | Golf software launched and windows positioned on the right screens |
| T-0 | Welcome window with the player's first name |
| In session | 5-minute and 1-minute warnings pop up on top of the game |
| End-3m | The player's current settings are captured and saved to their account |
| End-20s | Golf software closed |
| End+0 | Smart plug OFF |

Back-to-back bookings **skip** the close and power-off, so the next player walks into a running bay.

## Key ideas

- **State machine.** The app is always in one of `IDLE`, `PRE_START`, `RUNNING`, `CLOSING` — not a
  pile of timers. Every scheduled action re-checks live data immediately before acting, because
  the booking may have moved or been cancelled since the timer was set.
- **Auto vs manual mode.** Manual disables all automation so staff can work on the PC. Mode changes
  are delivered through a commands table with realtime *plus* polling, because realtime alone was
  not reliable enough.
- **One instance only.** Two copies running produce fighting commands and double launches.
- **Watchdog.** A scheduled task restarts the app if it's closed.
- **Kiosk mode.** Locks the PC to the golf experience; staff unlock with a code.
- **Logs first.** Every action writes a log with both server and local timestamps. Every
  "the bay didn't turn on" investigation starts in the controller logs, not in the code.

## Rules that must not be broken

- Re-validate the booking inside the timer callback, never trust what was true when it was set.
- Never restore the venue baseline settings when the software closes — it wipes the customer's own
  settings. Baseline restores happen *before* launch only.
- Background browsers throttle timers. Anything that must happen exactly on time is enforced in
  the desktop process, not left to a background tab.
- Don't hardcode bay numbers or a bay count.

## Deployment

The app is built by a GitHub Actions workflow into a Windows installer and auto-updates from
GitHub Releases. Each client gets their own app id, product name and release repo. See
`docs/platform/09-BAY-CONTROLLER-BUILD.md`.

## Exercise

1. Read the timeline table until you can recite it.
2. Open the Bay Controller logs in the admin hub for a real session and narrate what happened,
   line by line.
3. In the product pack, find where the plug driver layer is specified and explain why a single
   installer can work in any country.

## Check yourself

- Why does each timer re-check the booking before acting?
- What happens differently for back-to-back bookings, and why?
- A client says "the bay was cold when the customer arrived". What's your first step?

→ Next: [10 — Remix to Live](10-REMIX-TO-LIVE.md)
