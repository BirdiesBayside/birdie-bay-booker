# Bay Controller Product — Remix & Handover Pack

This folder is a self-contained context pack for turning the Birdies Bay Controller into a
standalone, booking-platform-agnostic product that any sim centre can install.

Nothing in this folder changes the live Birdies system. It exists so you can **remix this
project** and then run one strip-down command in the remix.

## Recommended order

1. **Remix this project** in Lovable (new project, new backend). Do not do this work in the
   live Birdies project.
2. Open the remix and paste `00-STRIP-DOWN-PROMPT.md` as your first message. That removes
   everything that isn't the controller.
3. Build the new schema from `03-DATA-CONTRACT.md`.
4. Build the push API from `04-UNIVERSAL-SESSION-API.md`.
5. Refactor plug control into drivers per `05-PLUG-DRIVER-LAYER.md`.
6. Add pairing and local config per `06-PAIRING-AND-CONFIG.md`.
7. Rebrand and cut the first installer per `07-BUILD-AND-RELEASE.md`.

## Files

| File | What it holds |
| --- | --- |
| `00-STRIP-DOWN-PROMPT.md` | The copy-paste command that strips the remix to controller-only |
| `01-ARCHITECTURE.md` | How the controller works: processes, scheduler, state machine, timeline |
| `02-RELIABILITY-RULES.md` | Hard-won behaviours that MUST be ported verbatim |
| `03-DATA-CONTRACT.md` | What the controller reads/writes today, and the multi-tenant replacement |
| `04-UNIVERSAL-SESSION-API.md` | The push API any booking platform integrates against |
| `05-PLUG-DRIVER-LAYER.md` | One installer, all countries: the plug driver interface |
| `06-PAIRING-AND-CONFIG.md` | Install → pairing code → bay binding, local config, offline cache |
| `07-BUILD-AND-RELEASE.md` | PyInstaller, electron-builder, NSIS, GitHub auto-update, rebranding |

## v1 scope

**In:** power automation, simulator launch/close/positioning, in-session warnings, per-player
settings restore, kiosk lockdown with staff override, logging, remote bay dashboard, push
session API, manual/walk-in sessions.

**Out (later add-on modules):** OBS recording and highlights, door/gate access, POS and bay
ordering, range CSV ingest / Swing Lab, league and competition management, licensing
enforcement.
