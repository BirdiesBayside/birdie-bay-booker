# Platform Handover — Read This First

> **Instructions for the AI agent in a remixed project:** Read this entire file before
> making any change. It describes what this platform is, the rules that must never be
> broken, and every venue-specific value you will need to reconfigure. The venue's
> completed onboarding questionnaire (branding, rates, hours, etc.) is the source of
> truth for the new values — apply it against the "Tenant Configuration" section below.
> Do not rename, restyle, or re-architect anything that isn't listed as venue-specific.

## What this platform is

A complete operating system for an unstaffed / lightly-staffed indoor golf simulator
venue:

- Public marketing website and online booking
- Membership subscriptions and pay-as-you-go bookings (Stripe)
- Automated bay control (power, PC apps, OBS streaming, kiosk) via a Windows Electron app
- A weekly online golf league (Simulator Golf Tour integration) with handicaps,
  leaderboards, prizes and auto-recorded video highlights
- A weekly in-person 2-man Ambrose competition
- Point of sale, bar tabs and QR table service
- Door access via smart lock (TTLock; Noke gate optional)
- Admin back-office: timetable, customers, analytics, marketing, settings
- One-off event support (e.g. "Sim Cup": event registration, payments, live streaming)

## Two domains, one codebase

The same React app serves two hostnames and changes navigation based on the host:

| Domain | Purpose |
| --- | --- |
| Booking domain (e.g. `birdiesbayside.com.au`) | Marketing site, booking, membership, account |
| Hub domain (e.g. `hub.birdiesbayside.com.au`) | League, comps, highlights, bay controller, admin, TV embeds |

Host detection lives in the app shell (`src/App.tsx` and layout components). The Bay
Controller Electron app loads **the Hub domain** in WebViews — it does not bundle the UI
except for the hardcoded Welcome Window HTML.

## Actors

- **Visitor** — no membership, pays per booking (peak/off-peak rates)
- **Members** (tiered weekly subscriptions, e.g. Weekday / Birdie / Eagle) — discounted hourly rate
- **Staff** — POS, timetable, comps
- **Admin** — everything, gated by `user_roles` + `has_role()`

Roles are **never** stored on `profiles`. They live in `public.user_roles` and are
checked through the `has_role(uuid, app_role)` security-definer function.

## Technology

- React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui
- Supabase (Lovable Cloud): Postgres, Auth, Storage, Edge Functions, Realtime
- Electron (Bay Controller, Windows), Capacitor (Android/iOS Hub app)
- Stripe, Resend, Cloudflare Stream, TTLock, TP-Link Tapo, Simulator Golf Tour API

## Hard rules — violating these breaks production

1. **Timezone.** Every date calculation, display, report and chat answer uses
   `Australia/Brisbane` (AEST, UTC+10, no DST) via the helpers in
   `src/lib/brisbane-time.ts`. Never bare `toLocaleString()` or ad-hoc `Date` maths for
   business logic. (If the new venue is in a different timezone, change the helpers in
   ONE place and rename usages accordingly — do not scatter new timezone logic.)
2. **Edge functions** use `npm:` imports, native `Deno.serve`, and full CORS headers on
   every response including `OPTIONS`. Webhooks set `verify_jwt = false` in
   `supabase/config.toml`.
3. **RLS + GRANTs.** Every new public-schema table needs `GRANT` statements in the same
   migration as `CREATE TABLE`, then `ENABLE ROW LEVEL SECURITY`, then policies. RLS
   alone is not enough — PostgREST returns a permission error without grants.
4. **Service role bypasses RLS.** Automated/cron edge functions use
   `SUPABASE_SERVICE_ROLE_KEY`. Never expose it client-side.
5. **Pagination.** PostgREST caps at 1,000 rows. Admin queries over large tables must
   use `.range()` batching. Aggregate counts use database triggers, not client counting.
6. **Never edit** `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`,
   `.env`, or `supabase/config.toml` project-level settings by hand.
7. **Idempotency.** Anything touching money is idempotent: Stripe webhook events are
   recorded in `stripe_processed_events`, checkout identifiers carry a random UUID
   suffix, booking charges use idempotency buckets.
8. **Design tokens.** Colours, fonts, gradients and shadows are semantic tokens in
   `src/index.css` + `tailwind.config.ts`. Never hardcode `text-white`, `bg-black`,
   `bg-[#hex]` in components. Rebrand by changing the tokens, not the components.
9. **UX simplicity first.** Prioritise low-friction customer booking/payment flows over
   heavy automated security or cleanup measures.

## Feature map (where things live)

```text
src/pages/                 route components (public, league, admin, embeds)
src/pages/marketing/       public marketing site
src/pages/admin/           back-office (timetable, customers, analytics, marketing, settings)
src/components/admin/      admin sub-components (settings, sgt, local-comps, ai-caddy)
src/components/booking/    booking flow UI
src/hooks/                 data hooks (useBooking, useAuth, useOperatingHours, usePricing…)
src/lib/                   brisbane-time, pricing-utils, sgt-api, range-stats, query-keys
supabase/functions/        ~90 edge functions
supabase/migrations/       schema history
electron/                  Bay Controller main process, Tapo bridge, OBS controller
android/                   Capacitor Android project
```

Key subsystems:

- **Booking engine** — peak/off-peak pricing from `pricing_config`, member hourly
  rates, deposit/credit balance (`deposit_transactions` audit log), "see-through"
  availability (own pending bookings overlap), auto-refund of duplicates.
- **Memberships** — weekly Stripe subscriptions charged immediately (no trials).
  Payment failure: 1st = cancel/refund future bookings + flag `payment_failed_at` +
  force visitor pricing; 2nd = downgrade to visitor + void invoice. Self-serve retry
  dialog; `payment_succeeded` clears the flag. Tier changes audited via trigger.
- **Bay Controller** (Electron, single instance) — explicit state machine; hardware
  power at T-3m, apps at T-1m, close T-20s, power off T+0; back-to-back bookings bypass
  shutdown; OBS stream keys are pushed from the backend every 30s and corrected even
  while streaming; auto-updates via GitHub Releases (repo must stay public).
- **League (SGT)** — weekly online tour via Simulator Golf Tour API: 6am auto-register
  (custom_hcp overrides), auto-close, exact-email identity matching, provisional
  handicaps after 3 rounds, monthly standings by calendar month, prize approval grants
  credit. TV leaderboard embeds under `/embed/tv-*`.
- **Local comps** — weekly 2-man Ambrose, combined handicap, position-based handicap
  adjustments on completion, first-timer flag if a debut team finishes 10+ under par.
- **POS** — anonymous QR ordering (public RLS on `pos_products`, realtime `bay_orders`),
  Credit / Customer Account (saved card) / Cash payments, daily 3am reconciliation.
- **Marketing** — campaign sends with open tracking, automated campaigns (first-session
  promo, membership-benefit) gated by `system_settings` flags, loyalty credit after 5th
  visitor booking, Google review rewards, gift cards, surveys.
- **Access** — TTLock door codes (must be 6 digits), Noke boom gate for dark hours.

## Tenant configuration — the rebrand checklist

### Already database-driven (change data, not code)

| What | Where |
| --- | --- |
| Bays and bay names | `bays` |
| Pricing, membership tiers, Stripe price IDs | `pricing_config` |
| Operating hours / staffed hours | `operating_hours`, `staffed_hours` |
| Public holidays | `public_holidays` |
| Email header/footer | `email_layout` |
| Email + SMS + marketing templates | `email_templates`, `sms_templates`, `marketing_templates` |
| POS products, table service | `pos_products`, `table_service_hours` |
| Door access rules | `door_access_settings` |
| SGT club credentials | `sgt_club_config`, `sgt_api_config` |
| Handicap / league / comp settings | `sgt_handicap_settings`, `sgt_tour_settings`, `local_comp_settings` |
| Loyalty / promo settings | `loyalty_promo_settings` |
| Misc app settings + campaign on/off flags | `system_settings` |

### Hardcoded — must be changed per venue

| Item | Location |
| --- | --- |
| Booking domain | ~25 edge functions, marketing pages, `src/components/Seo.tsx` (email links, Stripe redirects) |
| Hub domain | host detection in app shell, Bay Controller WebViews |
| Contact / noreply / admin email addresses | edge functions |
| Venue phone, name, legal entity, ABN/company no., address | marketing + legal pages |
| Brand colours + fonts | `src/index.css`, `tailwind.config.ts` (tokens only) |
| Logos, hero video, imagery | `src/assets/`, `public/` |
| `public/birdies-guide.html` | Quick Start guide — rewrite per venue |
| `public/bayside/*` | original venue's lead-gen pages — delete from any client project |
| Terms / privacy / media-consent text | `src/components/legal/TermsContent.tsx`, `src/pages/PrivacyPolicy.tsx`, version in `src/lib/terms-version.ts` |
| Capacitor app id | `capacitor.config.ts`, `android/` |
| `google-services.json` | `android/app/` (per Firebase project) |
| Electron appId, productName, artifact name, release repo | `electron/package.json`, `.github/workflows/build-electron.yml` |
| Bay Controller access password | Bay Controller UI |
| Seeded Stripe price IDs | old migration — never reuse another venue's price IDs |

### Secrets to (re)create per project — secrets never travel with a remix

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, SMS provider
credentials, Cloudflare Stream account id + token, TTLock client id/secret + account
credentials, Tapo credentials (stored on bay PCs), SGT username/password, Noke
credentials if the venue has a gate.

### Third-party accounts per client

Stripe, Resend (verified domain), SMS provider, Cloudflare Stream, TTLock Open
Platform, Tapo, Simulator Golf Tour club, Google Cloud/Firebase (push + OAuth), GitHub
repo for Bay Controller releases, Google Play / Apple developer accounts if shipping
mobile apps.

## Suggested onboarding order

1. Apply the venue questionnaire to the database-driven tables above (pricing, hours,
   bays, templates).
2. Rebrand tokens in `src/index.css` / `tailwind.config.ts`, swap logos/imagery.
3. Find-and-replace domains and email addresses across edge functions; update legal
   pages and the Quick Start guide.
4. Create the venue's Stripe products/prices and update `pricing_config`; add all
   secrets; configure Stripe webhook endpoint.
5. Configure SGT club credentials if the venue runs the league.
6. Set up bay PCs: install Bay Controller, point it at the Hub domain, set Tapo/OBS
   credentials per bay.
7. Test end-to-end: a visitor booking, a member booking, a POS order, a door code,
   and one full bay automation cycle.
