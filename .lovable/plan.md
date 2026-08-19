# Bay Controller OS — standalone, booking-platform-agnostic product

Turn the Birdies Bay Controller into a product other sim centres can buy: one Windows installer, one small cloud backend, and a universal booking API that any booking platform can push sessions into. Birdies stays untouched — this is built in a fresh remixed project.

## Why a remix

The current controller is welded to the Birdies schema (`bookings`, `profiles`, memberships, SGT, POS). Adding a tenant layer here risks the live venue. A remix lets us strip everything except the controller and rebuild the data model around venues instead of one club.

## The product in three parts

**1. Windows app (Electron)** — the existing controller, de-Birdied.
Keeps: precision scheduler, state machine, plug control, app launch/positioning, warnings and popups, kiosk mode, settings restore, logging, auto-update.
Drops for v1: SGT/league, OBS recording, highlights, POS orders, door codes, range CSV ingest.
Configured by a **pairing code** instead of hardcoded bay IDs: install, enter code, the PC binds itself to a bay in the venue's cloud account.

**2. Cloud backend** — small multi-tenant schema.
`venues`, `bays`, `bay_devices`, `bay_pcs`, `sessions`, `api_keys`, `controller_logs`, `player_settings`, `venue_users`. Every table scoped by `venue_id`, RLS on venue membership, service role for the controller.
Plus a lightweight web dashboard: bays and live status, session list, logs, device setup, API keys, kiosk unlock codes.

**3. Universal Session API (push)** — the integration surface.
The venue's booking platform (or a Zapier/Make step) POSTs bookings to us.

```text
POST /v1/sessions            create or upsert a session
PATCH /v1/sessions/{ref}     reschedule / extend
DELETE /v1/sessions/{ref}    cancel
POST /v1/sessions/bulk       daily schedule sync
GET  /v1/bays                discover bay ids
```

Auth: `Authorization: Bearer <venue api key>`. Idempotent on the caller's `external_ref`.

```json
{
  "external_ref": "acuity-88213",
  "bay_ref": "bay-1",
  "starts_at": "2026-09-01T18:00:00+10:00",
  "ends_at": "2026-09-01T20:00:00+10:00",
  "player": { "name": "Cal Brown", "email": "cal@x.com" },
  "notes": "birthday",
  "flags": { "kiosk": true }
}
```

Plus **manual/walk-in start** in the app and dashboard so a venue with no integration still gets full value on day one.

## Plug driver layer (one installer, all countries)

Replace the hardcoded Tapo path with a driver interface — `on()`, `off()`, `status()`, `test()` — and register per-brand drivers:

| Driver | Reach |
| --- | --- |
| Shelly (local HTTP) | Sold in every plug type worldwide, no cloud account, recommended default |
| Tapo P110 (bundled exe) | Current Birdies path, kept as-is |
| Kasa | Common in US/UK |
| Tuya / Smart Life (local key or cloud) | Widest cheap-brand coverage |
| Generic HTTP webhook | Any relay, PDU or home-automation hub |
| MQTT | Tasmota / Home Assistant setups |

Setup UI: pick brand, discover or enter IP, credentials if the brand needs them, **Test on/off** button. No per-country builds — country only changes which plug hardware they buy, and each driver's connection details are entered in settings.

## Build order

1. Remix the project, strip to controller + auth shell.
2. New multi-tenant schema with RLS and grants.
3. `sessions-api` edge function (v1 endpoints, API key auth, idempotency, validation).
4. Pairing flow: pairing codes, `bay_pcs` binding, controller reads its own bay's sessions.
5. Driver layer refactor in `electron/main.js` + settings UI with per-driver forms and test buttons.
6. De-Birdie the scheduler: drive from `sessions` rows, generic warning/welcome copy, venue name and logo from `venues`.
7. Player settings restore keyed by player email within the venue.
8. Kiosk mode + staff override codes per venue.
9. Dashboard pages (bays, sessions, logs, devices, API keys).
10. Rebrand installer, auto-update channel, and write the integration docs (API reference + Zapier recipe + plug setup guide).

## Technical notes

- Controller talks only to the cloud API — no direct database coupling, so integrators never touch our schema.
- API keys hashed at rest; per-key rate limit; every write logged for support.
- Session cache on disk so a session already scheduled still runs through an internet outage.
- Webhooks out (`session.started`, `session.ended`, `bay.offline`) are a v1.1 item, not v1.
- Existing hard-won reliability behaviour is ported verbatim: just-in-time booking re-validation, B2B launch guard, plug-off safety net, launch-loop lockout, crash recovery, mode-sync via commands table.
- Recording/highlights and door access stay out of v1 and become paid add-on modules later.

## Open items for later

Pricing/licensing enforcement (per-bay subscription check in the pairing flow), and whether non-GSPro simulators (TrackMan, Foresight, Uneekor, E6) need launcher profiles beyond a generic exe-path config.
