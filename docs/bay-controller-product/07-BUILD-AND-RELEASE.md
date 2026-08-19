# 07 — Build, Release and Rebranding

## Build pipeline (as it works today)

The GitHub Actions workflow `.github/workflows/build-electron.yml` runs on
`windows-2022` and triggers on pushes touching `electron/**`,
`src/pages/BayController.tsx`, `src/bay-controller-main.tsx`, `bay-controller.html`,
`vite.config.electron.ts`, or on manual dispatch.

Steps:

1. **Build the plug binary** — `pip install pyinstaller tapo`, then
   `pyinstaller --onefile --distpath . tapo_control.py` → `electron/tapo_control.exe`.
2. **Set the version** — reads `latest.yml` from the repo's latest GitHub release, takes
   `max(local patch, released patch) + 1`, writes it back to `electron/package.json`. This
   makes versions deterministic even if the local file is stale.
3. **Build the renderer** — `npx vite build --config vite.config.electron.ts` →
   `dist-electron-app/`.
4. **Build the installer** — `npx electron-builder --publish never` in `electron/`.
5. **Resolve the updater asset** — reads `path:` from `latest.yml` and makes sure a file
   with exactly that name exists (copies the newest `.exe` if the name drifted).
6. **Create the GitHub Release** — tag `v<version>`, uploading the installer **and**
   `latest.yml`.

### Auto-update requirements (do not break these)

- `latest.yml` must be attached to every release, alongside an installer whose filename
  matches its `path:` field exactly.
- **No spaces in the artifact name.** `artifactName` is
  `BirdiesBayController-Setup-${version}.${ext}` for this reason — spaces broke
  electron-updater's download URL.
- `publish` in `electron/package.json` must point at the repo that hosts the releases.
- The repo must be **public** (or the updater needs a token) for electron-updater to read
  releases.
- Versions must increase monotonically; never re-tag.

### NSIS settings that matter

`oneClick: false`, `allowToChangeInstallationDirectory: true`, desktop + start menu
shortcuts, `runAfterFinish: true`. Owners install this themselves, so the wizard has to be
ordinary.

### extraResources

`../dist-electron-app` → `dist` (the renderer) and `tapo_control.exe` at the resources root.
The main process searches `__dirname`, `process.resourcesPath` and `app.getAppPath()` for
the exe — keep that fallback chain when adding new bundled binaries.

## Rebranding checklist for the product

| Where | Change |
| --- | --- |
| `electron/package.json` | `name`, `description`, `build.appId`, `build.productName`, `build.nsis.artifactName`, `build.publish.owner/repo` |
| `electron/icon.png` | New product icon |
| `.github/workflows/build-electron.yml` | The `latest.yml` fetch URL → new repo |
| `index.html` | Product `<title>` and `<meta name="description">`, plus matching `og:`/`twitter:` tags |
| `src/index.css`, `tailwind.config.ts` | Neutral product tokens; keep everything semantic, no hardcoded colour utilities in components |
| Welcome window HTML | Venue name, logo and house rules from config, not hardcoded |
| Notification popups | Venue contact number from config |
| `electron/watchdog.bat` | Product exe name and install path |

## Version convention

Release commit titles use `{version} - {description}`, e.g. `1.0.70 - Fixed plug-off race`.
The renderer displays the real binary version via the `get-app-version` IPC — never a
hardcoded string, because during an update rollout you need to know exactly which build a
bay is running. The heartbeat sends the same value so the dashboard can show per-bay
versions and flag stragglers.

## Per-bay PC setup notes

- Disable Windows OOBE prompts, Microsoft Account nags and automatic updates/restarts —
  each of these has blocked a bay mid-session.
- Set the PC to never sleep the display if any long-running task depends on timers.
- Install the watchdog Task Scheduler job (30-second interval).
- Set a static IP or DHCP reservation for the smart plug; a changed IP is the single most
  common support ticket.

## Release channels

Ship one stable channel to start. When you have more than a handful of venues, add a beta
channel by publishing prereleases and letting a venue opt in from settings — you do not
want to discover a scheduler regression across every customer at once.
