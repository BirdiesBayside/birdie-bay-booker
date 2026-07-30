## Keypad research — what we're dealing with

The unit is an **Active Online IP68 standalone keypad with 125kHz RFID + WiFi (Tuya)**. Key points:

- It is a **standalone** controller (Wiegand 26 out, relay on board). All user/code administration happens **on the device or through the Tuya / Smart Life app** — there is no vendor API of its own.
- The only programmatic route is the **Tuya IoT Cloud OpenAPI** (`openapi.tuya.com`). You create a free Tuya IoT developer project, link the Smart Life account the keypad is paired to, then call signed HTTP requests (HMAC-SHA256 over client_id + access_token + timestamp + body).
- Tuya's dedicated **temporary-password APIs** (`/v1.0/devices/{id}/door-lock/temp-password`) are built for the *smart lock* product category. Access-control keypads like this one usually expose the same functionality through **device data points (DPs)** instead — e.g. `unlock_temporary`, `temp_unlock_list`, `remote_unlock`. Which DPs exist is device-firmware specific and can only be confirmed by querying `/v1.0/devices/{device_id}/specifications` once the device is linked.

**Honest assessment:** remote unlock is near-certain to work; *scheduled temporary codes pushed from the cloud* are likely but **not guaranteed** until we read the device's DP spec. So the plan builds the whole system provider-agnostically with a `**tuya` driver + a `manual` fallback driver** (code generated and shown/sent to the customer, staff pre-loads a pool of codes into the keypad and we assign from that pool). That way nothing is wasted if the DPs turn out to be limited.

---

## Part 1 — Settings reorganisation (safe, do first)

In `AdminSettings.tsx`, add a new default-collapsed `CollapsibleSection` titled **"Access & Messaging"** in the **General** tab, positioned **between Bay Management and General Settings**. It contains two nested collapsible sub-sections (same pattern as Operating Hours):

1. **Door Access** — the door code field currently buried inside `SmsTemplatesSection`, plus the new door-code settings (Part 3).
2. **SMS Templates** — the existing `SmsTemplatesSection` template editor, moved out of the Notifications tab.

`SmsTemplatesSection.tsx` gets split so the door-code card and the template list can be rendered independently.

## Part 2 — Data model

`**door_access_settings**` (single row, `id = 'global'`)

- `mode` — `fixed` | `daily` | `per_booking` | `unstaffed_only` (default `**fixed**` — nothing changes today)
- `fixed_code`, `code_length`, `code_format` (numeric + `#` suffix)
- `valid_from_minutes_before` = **20**, `valid_until_minutes_after` = **1**
- `provider` — `manual` | `tuya`, `tuya_device_id`, `enabled`

`**door_codes**` — one row per issued code

- `booking_id`, `user_id`, `code`, `valid_from`, `valid_until`, `status` (`pending` / `active` / `revoked` / `expired` / `failed`), `provider`, `provider_ref`, `slot_index`, `last_error`
- Unique partial index so a booking has only one live code; codes never collide with an active window.

`**door_code_events**` — audit log of issue / extend / revoke / sync-failure, plus any unlock events pulled back from Tuya.

## Part 3 — Settings UI (inside Access & Messaging → Door Access)

- Mode selector with plain-English descriptions of each option.
- Fixed code field (as today).
- Number inputs: *valid from X minutes before start* (default 20) and *expires Y minutes after end* (default 1).
- Provider block: Tuya on/off, device ID, "Test connection" button, and a read-only display of the detected device capabilities once credentials exist.
- A live list of currently-active codes with a manual **Revoke** button.

## Part 4 — Lifecycle wiring (the part you specified)

New edge function `**door-code-manager**` with actions `issue`, `sync`, `revoke`, `refresh`:

- **On booking confirmed** → if mode requires it, generate a unique code, window = `start − 20 min` → `end + 1 min`, push to provider.
- **On extend** (`extend-booking`) → the same code's `valid_until` is recalculated from the new end time and re-pushed. Code stays the same so the customer isn't confused.
- **On cancel / reschedule** (`cancel-booking`, `reschedule-booking`) → revoke immediately (reschedule re-issues against the new window).
- **Reconciliation cron** (every 5 min) → catches anything the inline call missed: expires past codes, retries failed pushes, and re-derives windows straight from the live booking row so the keypad can never drift from the booking table.
- `{door_code}` merge tag resolves per-booking when a booking-scoped code exists, otherwise falls back to the fixed code — so existing SMS/email templates keep working untouched.

## Part 5 — Tuya driver

`supabase/functions/_shared/tuya.ts`: token fetch + signed request helper, then
`issueCode` / `revokeCode` / `unlockNow` implemented against the temp-password DPs, with capability detection via `/specifications`. Requires two secrets when you're ready: `**TUYA_ACCESS_ID**` and `**TUYA_ACCESS_SECRET**` (plus region endpoint — Australia sits on the `openapi.tuya.com` / US-West cluster).

Until those exist, the provider stays `manual`: codes are generated, stored, shown in admin and sent to the customer, and the system logs "provider not configured" rather than failing the booking. Flipping to live is then a single settings toggle.

## Technical notes

- All windows computed in `Australia/Brisbane` via `src/lib/brisbane-time.ts`.
- Codes are numeric-only (keypad limitation), collision-checked against active codes, and never reused within 24h.
- Door code issuance must **never** block booking confirmation — all provider calls are fire-and-forget with retry via the reconciliation cron.
- New tables get explicit GRANTs; customer read access is scoped to their own booking's code, admin-only for settings.

**Suggested order:** Part 1 (settings move) → Part 2/3 (schema + UI, mode stays `fixed`) → Part 4 (lifecycle in manual mode) → Part 5 (Tuya) once you've created the IoT project.  
  
Last thing, i belive the codes set by API must be 6 digits, i would prefer 4 digits but if there is any documentation on this please find out, worth remembering if we get errors or dead codes due to length