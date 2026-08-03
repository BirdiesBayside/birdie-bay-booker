# 06 — Integrations

Every integration below is per-project. **Secrets never survive a remix** — each client
project must have its own credentials added through the backend secrets manager.

## Stripe — payments, subscriptions, terminal

- Secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable key served by
  `get-stripe-publishable-key`.
- API version `2025-07-30.basil`, currency AUD.
- Webhook endpoint: the `stripe-webhook` function, `verify_jwt = false`.
- Products/prices are created per venue and stored in `pricing_config`.
- `stripe-terminal` supports in-person card payments at the counter.
- See `03-MEMBERSHIPS-BILLING.md`.

## Resend — transactional and marketing email

- Secret: `RESEND_API_KEY`.
- Requires a verified sending domain per client. Sender addresses are venue-specific.
- All sends pass through `_shared/email-wrapper.ts`.

## SMS

Templates in `sms_templates`; the provider credentials are project secrets. Numbers must
be in international format.

## Simulator Golf Tour (SGT)

- Config: `sgt_club_config` (club URL, username, password) and `sgt_api_config`.
- Set up via Admin → SGT Manager → gear icon, which includes a **Test Connection** action.
- Registration order club → tour → tournament is mandatory.

## Cloudflare Stream — league video

- Secrets: Cloudflare account id and API token.
- Uploads are **tus** resumable (2GB limit on plain uploads).
- `stream-upload`, `stream-clip`, `league-highlights-signed-url`, `clip-download-proxy`,
  `purge-old-recordings`, `session-download-url`.

## Tuya IoT Cloud — door keypad

- Tables: `door_access_settings`, `door_codes`, `door_code_events`.
- Function: `door-code-manager`. Helper: a `TuyaClient` with HMAC request signing and
  ticket-encrypted temporary passwords.
- **Codes must be exactly 6 digits.** Any other length is accepted by the API but never
  reaches the device.
- Per-booking codes are issued with configurable pre-booking lead time and expiry.
  Named permanent codes (staff, contractors) use `label` + `is_permanent` with a 10-year
  expiry, and can be revoked individually.
- The Tuya **Trial** licence is sufficient: usage sits far below the monthly API call
  allowance. "Trial" refers to missing enterprise-scale features, not to a time limit.
- Setup: create a Tuya IoT Cloud project, then link the Smart Life mobile app account via
  "Link Tuya App Account" → QR code, so the cloud project can see the device.

## TP-Link Tapo — smart plugs

- Controlled from the Bay Controller via `tapo_control.exe` (PyInstaller build of
  `tapo_control.py`), using a Tapo account login.
- Plugs are paired to the venue's own WiFi on site; map them by MAC / device id rather
  than IP so DHCP changes don't break automation.
- Known failure: a P110 firmware update added a `charging_status` field that the Python
  library could not parse, hanging the controller. If plug calls start erroring, check the
  library version first.

## OBS Studio

Installed on each bay PC, controlled over OBS WebSocket by `electron/obs-controller.js`.

## Noke — boom gate

API integration granting gate access during dark hours (before 7am / after 5pm).

## Lovable AI Gateway

Used for AI Caddy (admin assistant), tournament commentary and Ambrose commentary. No
customer API key required — it runs on the platform gateway.

## Google

- OAuth sign-in provider (must be configured in the backend auth settings, or first
  sign-in errors with "Unsupported provider").
- `google-services.json` for FCM push on Android.
- Google Search Console for SEO.

## Capacitor mobile

Android and iOS wrappers of the Hub. Package id, app name, icons, signing keys and
`google-services.json` are per client. Stripe flows open in Safari View Controller /
Custom Tabs (`src/hooks/useInAppBrowser.ts`).
