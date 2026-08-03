# 09 — Bay Controller: GitHub Repo, EXE Build and Auto-Update

**Keep this system. Do not delete the Birdies repo.** Every client needs the same Windows
installer with the same auto-update behaviour — only the wiring changes. The Tapo login
flow is already built and works for any customer's Tapo account.

## How it works today

The Bay Controller is built by GitHub Actions from the same repository that holds the web
app, and published as a GitHub Release. `electron-updater` inside the installed app polls
that release feed and updates itself silently.

```text
push to main (electron/** or bay controller sources)
        │
        ▼
GitHub Actions (windows-2022)  .github/workflows/build-electron.yml
  1. PyInstaller → tapo_control.exe
  2. read latest.yml from the latest Release → bump patch version
  3. vite build --config vite.config.electron.ts  → dist-electron-app
  4. electron-builder (NSIS)                      → Setup .exe + latest.yml
  5. softprops/action-gh-release → publish v{version}
        │
        ▼
Installed app  →  electron-updater reads latest.yml  →  downloads + installs
```

### Key files

| File | Role |
| --- | --- |
| `.github/workflows/build-electron.yml` | The whole CI pipeline |
| `electron/package.json` | appId, productName, publish target, artifact name, deps |
| `electron/main.js` | Main process, incl. `autoUpdater` wiring |
| `electron/tapo_control.py` | Tapo plug bridge, compiled to `.exe` in CI |
| `vite.config.electron.ts` | Builds the controller renderer only |
| `electron/watchdog.bat` | Task Scheduler restart guard on the bay PC |

### Versioning

The workflow does **not** trust the local `package.json` version. It fetches
`latest.yml` from the latest GitHub Release, compares major/minor, and sets the patch to
`max(local, released) + 1`. This makes versions deterministic even when several builds run
close together, and guarantees `electron-updater` always sees a higher version.

Commit titles for controller changes follow `{version} - {description}`.

### Auto-update requirements (do not break these)

- The release must contain **both** the `.exe` and `latest.yml`.
- The artifact filename must match the `path:` field in `latest.yml`. The workflow has a
  "Resolve updater asset path" step that copies/renames the newest `.exe` to the expected
  name if electron-builder produced something different.
- Artifact names must contain **no spaces** — spaces broke updater downloads.
- The GitHub repo must be **public** (or the updater needs a token). Birdies' repo is
  public for exactly this reason; all secrets live in the backend, never in the repo.
- `publish` in `electron/package.json` must point at the client's own repo.

## Standing up a client's Bay Controller

1. **Connect the client's Lovable project to its own GitHub repo** (chat → plus menu →
   GitHub → Connect project). Make it public, or plan for a token-based update feed.
2. Edit `electron/package.json`:
   ```jsonc
   {
     "name": "<client>-bay-controller",
     "version": "1.0.0",
     "description": "Bay Controller for <Client Venue>",
     "author": "<Client or Bayside Golf>",
     "build": {
       "appId": "com.<client>.baycontroller",
       "productName": "<Client> Bay Controller",
       "publish": { "provider": "github", "owner": "<gh-owner>", "repo": "<gh-repo>" },
       "nsis": { "artifactName": "<Client>BayController-Setup-${version}.${ext}" }
     }
   }
   ```
   No spaces in `artifactName`.
3. Edit `.github/workflows/build-electron.yml`: change the hardcoded
   `https://github.com/BirdiesBayside/birdie-bay-booker/releases/latest/download/latest.yml`
   URL in the version step to the client's repo, and the upload-artifact name.
4. Replace `electron/icon.png` with the client's icon.
5. Point the controller at the client's Hub domain (the WebView URLs) and set the
   controller access password.
6. Push to `main` (or run the workflow manually via `workflow_dispatch`). The first
   Release is `v1.0.1`.
7. Install the `.exe` on each bay PC, select the bay number, sign in to the client's Tapo
   account, and assign plugs.
8. Configure `watchdog.bat` in Windows Task Scheduler (every 30s) and enable auto-start.

## Per-bay PC setup notes

- Disable Windows OOBE prompts, Microsoft Account nagging, and automatic OS updates —
  they block the automation with modal dialogs.
- One controller instance per PC. Never two.
- Install OBS + WebSocket if the venue runs recorded league rounds.
- Pair Tapo plugs to the venue WiFi in the Tapo app first, then map them by MAC / device
  id in the controller so a DHCP change cannot break automation.
- Verify: plug on/off, app launch, settings restore, warnings, hard-stop, and (if used)
  an OBS recording that uploads successfully.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| App never updates | Release contains `latest.yml`? filename matches `path:`? repo public? |
| Build fails at PyInstaller | `pip install tapo` version drift |
| Plug calls error after firmware update | Tapo library parsing new fields (e.g. `charging_status`) |
| Blank controller window | Hub domain unreachable, or wrong WebView URL |
| Duplicate automation actions | Two instances running — check Task Manager and the watchdog |
