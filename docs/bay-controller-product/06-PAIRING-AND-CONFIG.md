# 06 — Pairing, Local Config and Offline

## Why pairing

Today the operator picks a bay number from a dropdown and the API hardcodes bays 1–6. For a
product, a PC must bind itself to exactly one bay in exactly one venue, survive reinstalls,
and never be confusable with another venue's bay.

## Flow

1. Owner creates the bay in the dashboard and clicks **Pair a PC**. We generate a short
   code (e.g. `K7Q-4M2`), valid 15 minutes, single use, stored on `bay_pcs`.
2. On first run the controller shows a full-screen pairing screen: venue-agnostic, one input.
3. The app POSTs `{ code, machine_id, app_version, hostname }` to the pairing endpoint.
4. The server validates the code, binds `bay_pcs` to the bay, and returns a long-lived
   **device token** plus the bay's configuration.
5. The app writes config to disk and never asks again. **Unpair** in the dashboard revokes
   the token; the app returns to the pairing screen on its next heartbeat.

`machine_id` is a stable per-PC identifier. Re-pairing the same machine_id to the same bay
replaces the old token instead of creating a duplicate row.

## Device token

- Sent as `Authorization: Bearer bcd_<token>` on every controller request.
- Scoped to one bay: it can heartbeat, read that bay's sessions and commands, write logs,
  and read/write player settings for its venue. Nothing else.
- Revocable per device. Rotated on demand from the dashboard.

## Local config file

`%APPDATA%/<ProductName>/config.json` — no secrets beyond the device token, which is
machine-bound and revocable:

```json
{
  "api_base": "https://…",
  "device_token": "bcd_…",
  "venue": { "id": "…", "name": "…", "timezone": "Australia/Brisbane", "contact_phone": "…" },
  "bay": { "id": "…", "ref": "bay-1", "name": "Bay 1" },
  "plug": { "driver": "shelly", "config": { "ip": "192.168.1.51" } },
  "launch": {
    "apps": [ { "name": "GSPro", "exe": "C:\\…\\GSPro.exe", "display": "primary" } ],
    "close_whitelist": ["GSPro", "GSProConnect"],
    "post_launch_delay_ms": 90000
  },
  "settings_restore": {
    "enabled": true,
    "folder": "C:\\…\\GSPro",
    "files": ["dpsV2x3.gss", "Settings.vgs"]
  },
  "kiosk": { "enabled": false }
}
```

Config is **server-authoritative**: the heartbeat returns a config version, and the app
pulls and rewrites the file when it changes. That means the owner changes plug IPs and exe
paths in the dashboard, not by walking to each PC.

Local overrides that must stay local: display assignment (physical to that PC) and the
GSPro folder path if it differs per machine.

## Offline behaviour

- Cache the next 24 hours of sessions to disk on every successful poll.
- If the API is unreachable, keep running the cached schedule and queue logs.
- Flush queued logs on reconnect with their original `local_timestamp`.
- Never cancel automation because a poll failed; only an explicit cancellation cancels.

## Kiosk unlock code

Per venue, set in the dashboard, delivered in the config payload, cached locally so it works
offline. Rotating it in the dashboard propagates on the next config pull. Do not hardcode a
password in the renderer — that is what the current build does and it must not ship in a
product.
