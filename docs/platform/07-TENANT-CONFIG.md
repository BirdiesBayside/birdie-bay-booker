# 07 — Tenant Configuration Inventory

Everything in this file is venue-specific. Use it as the checklist when de-branding
(`08-DEBRANDING-GUIDE.md`) and when standing up a client (`10-ONBOARDING-RUNBOOK.md`).

## Already database-driven (no code changes needed)

| What | Where |
| --- | --- |
| Bays and bay names | `bays` |
| Pricing and Stripe price IDs | `pricing_config` |
| Operating hours / staffed hours | `operating_hours`, `staffed_hours` |
| Public holidays | `public_holidays` |
| Email header/footer | `email_layout` |
| Email + SMS templates | `email_templates`, `sms_templates`, `marketing_templates` |
| POS products, table service | `pos_products`, `table_service_hours` |
| Door access rules | `door_access_settings` |
| SGT club credentials | `sgt_club_config`, `sgt_api_config` |
| Handicap and league settings | `sgt_handicap_settings`, `sgt_tour_settings`, `local_comp_settings` |
| Loyalty / promo settings | `loyalty_promo_settings` |
| Misc app settings | `system_settings` |

## Hardcoded — must be changed per venue

| Item | Location | Notes |
| --- | --- | --- |
| Booking domain `birdiesbayside.com.au` | ~25 edge functions, marketing pages, `src/components/Seo.tsx` | Links in emails, Stripe redirect URLs |
| Hub domain `hub.birdiesbayside.com.au` | host detection in app shell, Bay Controller WebViews | |
| `info@birdiesbayside.com` (41 uses) | edge functions | Contact/reply-to |
| `noreply@birdiesbayside.com` (7) | edge functions | Sender |
| `admin@birdiesbayside.com` (7) | edge functions | Internal alerts |
| Venue phone number | marketing pages, unstaffed-hours templates | |
| Venue name / legal entity / ABN / address | marketing pages, legal pages | |
| Brand colours + fonts | `src/index.css`, `tailwind.config.ts` | Green/orange/cream, Anton/Inter |
| Logos, hero video, imagery | `src/assets/`, `public/` | |
| `public/birdies-guide.html` | Quick Start guide | Rewrite per venue |
| `public/bayside/*` | Sam's own lead-gen pages | Delete from any client project |
| Terms / privacy / media-consent text | `src/components/legal/TermsContent.tsx`, `src/pages/PrivacyPolicy.tsx` | Includes recording-consent and liability clauses; version string in `src/lib/terms-version.ts` |
| Capacitor app id `com.birdiesbayside.hub` | `capacitor.config.ts`, `android/` | |
| `google-services.json` | `android/app/` | Per Firebase project |
| Electron appId `com.birdies.baycontroller`, productName, artifact name | `electron/package.json` | |
| Bay Controller release repo `BirdiesBayside/birdie-bay-booker` | `electron/package.json` publish block, `.github/workflows/build-electron.yml` | See `09-BAY-CONTROLLER-BUILD.md` |
| Bay Controller access password | Bay Controller UI | |
| Seeded Stripe price IDs | old migration `20260103043719_*.sql` | Do not reuse another venue's price IDs |

## Secrets to (re)create per project

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, SMS provider credentials,
Cloudflare Stream account id + token, Tuya client id/secret + device id, Tapo account
credentials (stored on the bay PCs), SGT username/password, Noke credentials if the venue
has a gate.

## Third-party accounts to create per client

Stripe, Resend (with verified domain), SMS provider, Cloudflare (Stream), Tuya IoT Cloud,
Tapo, Simulator Golf Tour club, Google Cloud/Firebase (push + OAuth), GitHub repo for the
Bay Controller releases, Google Play / Apple developer accounts if shipping mobile apps.
