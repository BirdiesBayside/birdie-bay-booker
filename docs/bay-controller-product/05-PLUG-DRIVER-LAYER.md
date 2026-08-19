# 05 — Plug Driver Layer

**One installer for every country.** The plug problem is a brand/protocol problem, not a
build problem — country only changes which physical plug the owner buys. Ship one app that
speaks several protocols and let them pick.

## Driver interface

Every driver implements the same four methods in the main process:

```js
{
  id: 'shelly',
  label: 'Shelly (local HTTP)',
  fields: [ /* form schema rendered in settings */ ],
  async on(config)     { /* -> { success, error? } */ },
  async off(config)    { /* -> { success, error? } */ },
  async status(config) { /* -> { success, isOn, error? } */ },
  async test(config)   { /* -> { success, detail } — on, wait, off */ }
}
```

`config` is the `bay_devices.plug_config` JSON for that bay. `bay_devices.plug_driver`
selects the driver. Nothing outside the driver registry knows a brand name — the scheduler
only calls `plug.on(bayId)` / `plug.off(bayId)`.

Requirements for every driver: 5-second timeout, 3 retries with backoff, an explicit
`retryable` flag on errors, and a `status()` read-back after `on`/`off` so a silent failure
is logged rather than assumed successful.

## Drivers to ship in v1

| Driver | Protocol | Config fields | Notes |
| --- | --- | --- | --- |
| **Shelly** (recommended default) | Local HTTP `/relay/0?turn=on` (Gen1) or RPC `Switch.Set` (Gen2+) | IP, generation, optional user/pass, channel | Sold worldwide in every plug type, no cloud account, no rate limits. Recommend this to new venues. |
| **TP-Link Tapo** | Bundled `tapo_control.exe` (Python `tapo` lib) | Cloud email, password, IP | Existing Birdies path — port as-is, including the diagnose command. |
| **TP-Link Kasa** | Local TCP 9999 | IP | Common in US/UK, no account needed. |
| **Tuya / Smart Life** | Local key (`tinytuya`-style) or Tuya Cloud | Device ID, local key, IP — or cloud client id/secret/region | Widest coverage of cheap regional brands. |
| **Generic HTTP** | Owner-supplied URLs | On URL, Off URL, Status URL, method, headers, JSON path for state | Covers PDUs, relays, Home Assistant, Node-RED, anything. |
| **MQTT** | Broker publish/subscribe | Broker URL, credentials, command topic, state topic, on/off payloads | Tasmota and Home Assistant setups. |

## Settings UI

Per bay: **Driver** dropdown → fields render from the driver's `fields` schema → **Discover
on network** (where the protocol supports it: Shelly mDNS, Kasa broadcast) → **Test on/off**
button that flashes the plug and reports the round-trip result → **Diagnose** for the
deeper probe (port scan, protocol detection, likely cause, recommendation) currently
implemented for Tapo, generalised to all drivers.

Store the result of the last successful test on `bay_devices` so the dashboard can show a
plug as "verified" versus "never tested".

## Hardware guidance to publish for owners

- Any plug works as long as it is rated for the bay's load (PC + projector/TV + launch
  monitor). Check the plug's amp rating against the local supply.
- Preferred: **Shelly Plug S / Plus Plug** — available in Type A/B/C/E/F/G/I variants and
  exposes a documented local HTTP API in every region.
- Avoid cloud-only brands with no local API; they break when the venue's internet drops,
  which is exactly when you least want the bay stuck on.
- For multi-device bays, a smart **power strip or PDU** with per-outlet control via the
  Generic HTTP driver is cleaner than several plugs.

## Explicitly not doing

Per-country installers. They triple the release matrix, and the plug shape has no bearing on
the software. Country-specific guidance belongs in docs, not in the build.
