# Bay Controller handover pack + one-shot strip-down prompt

Don't build the new product here. Instead, produce a complete, self-contained context pack in this repo so you can remix the project and run a single command that strips the remix down to a standalone, booking-platform-agnostic Bay Controller.

## What gets created

All under `docs/bay-controller-product/`:

**1. `00-STRIP-DOWN-PROMPT.md`** — the command you paste into the remix.
A precise, copy-paste instruction block that tells the agent to:
- Delete everything not controller-related (bookings UI, memberships/Stripe, SGT/league, local comps, marketing, POS, door access, clubhouse, gift cards, highlights/OBS, Swing Lab, Capacitor mobile, marketing site pages) with explicit file/folder lists.
- Keep: `electron/**`, `src/pages/BayController.tsx`, `src/bay-controller-main.tsx`, `bay-controller.html`, `vite.config.electron.ts`, `src/components/bay-controller/**`, the shadcn UI kit, auth shell, and the build workflow.
- Drop all Birdies-specific tables and replace them with the new multi-tenant schema.
- Rebrand app id, product name, installer name, update channel.
- Verification checklist to run at the end.

**2. `01-ARCHITECTURE.md`** — how the controller works, extracted from the live system: main/preload/renderer split, precision scheduler, state machine (`IDLE`, `PRE_START`, `RUNNING`, `CLOSING`), automation timeline (T-3m plug, T-3m settings restore, T-1m launch, warnings, End-3m capture, End-20s close, End+0 power off), B2B bypass, single-instance rule, watchdog.

**3. `02-RELIABILITY-RULES.md`** — the hard-won behaviours that must be ported verbatim: just-in-time booking re-validation, B2B launch guard, reschedule plug-off safety net, launch-loop 60s lockout, crash recovery, mode sync via commands table with polling fallback, display warm-up/retry/`Win+Shift+Arrow` fallback, `closeApps()` window-based kill, GSPro config reset on close.

**4. `03-DATA-CONTRACT.md`** — exactly what the controller reads and writes today (`bays`, `bay_devices`, `bay_commands`, `bay_controller_logs`, booking fields consumed, `bay-controller-api` and `bay-user-settings` endpoints), then the target multi-tenant replacement: `venues`, `bays`, `bay_devices`, `bay_pcs`, `sessions`, `api_keys`, `controller_logs`, `player_settings`, `venue_users` — with RLS and grant rules.

**5. `04-UNIVERSAL-SESSION-API.md`** — the push API spec any booking platform integrates against:

```text
POST   /v1/sessions          upsert by external_ref
PATCH  /v1/sessions/{ref}    reschedule / extend
DELETE /v1/sessions/{ref}    cancel
POST   /v1/sessions/bulk     daily schedule sync
GET    /v1/bays              discover bay refs
```

Bearer venue API key, idempotent on `external_ref`, sample payloads, error codes, plus walk-in/manual start as the zero-integration fallback.

**6. `05-PLUG-DRIVER-LAYER.md`** — the driver interface (`on`, `off`, `status`, `test`) and one build for all countries: Shelly (local HTTP, recommended default), Tapo P110 (current bundled exe), Kasa, Tuya/Smart Life, generic HTTP webhook, MQTT. Setup UI requirements and per-driver connection fields. No per-country installers.

**7. `06-PAIRING-AND-CONFIG.md`** — install → enter pairing code → PC binds to a bay; local config file contents, offline session cache, kiosk unlock codes.

**8. `07-BUILD-AND-RELEASE.md`** — condensed from the existing build docs: TAPO exe via PyInstaller, `vite.config.electron.ts`, electron-builder + NSIS, GitHub Releases auto-update, sequential versioning workflow, rebranding checklist.

**9. `README.md`** — index and the recommended order: remix → paste strip-down prompt → schema → API → drivers → rebrand.

## Notes

- Pure documentation: no source files, schema, or edge functions in this project change.
- Docs are written against the current code, not from memory, so file paths and behaviours in them are real.
- Out of v1 and flagged as later add-ons: recording/highlights/OBS, door access, POS, range CSV ingest, licensing enforcement.
