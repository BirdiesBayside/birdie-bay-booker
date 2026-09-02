# 00 — Platform Overview

## What this platform is

A complete operating system for an unstaffed / lightly-staffed indoor golf simulator
venue. It covers:

- Public marketing website and online booking
- Membership subscriptions and pay-as-you-go bookings (Stripe)
- Automated bay control (power, PC apps, settings, kiosk) via a Windows Electron app
- A weekly online golf league (Simulator Golf Tour integration) with handicaps,
  leaderboards, prizes and auto-recorded video highlights
- A weekly in-person 2-man Ambrose competition
- Point of sale, bar tabs and table service
- Door access via a TTLock smart lock
- Admin back-office: timetable, customers, analytics, marketing, settings

## Two domains, one codebase

The same React app serves two hostnames and changes navigation based on the host:

| Domain | Purpose |
| --- | --- |
| Booking domain (`birdiesbayside.com.au`) | Marketing site, booking, membership, account |
| Hub domain (`hub.birdiesbayside.com.au`) | League, comps, highlights, bay controller, admin, TV embeds |

Host detection lives in the app shell (`src/App.tsx` and layout components). The Bay
Controller Electron app loads **the Hub domain** in WebViews — it does not bundle the UI
except for the hardcoded Welcome Window HTML.

## Actors

- **Visitor** — no membership, pays per booking (peak/off-peak rates)
- **Weekday / Birdie / Eagle member** — weekly Stripe subscription, discounted hourly rate
- **Staff** — POS, timetable, comps
- **Admin** — everything, gated by `user_roles` + `has_role()`

Roles are **never** stored on `profiles`. They live in `public.user_roles` and are checked
through the `has_role(uuid, app_role)` security-definer function.

## Technology

- React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui
- Supabase (Lovable Cloud): Postgres, Auth, Storage, Edge Functions, Realtime
- Electron (Bay Controller, Windows), Capacitor (Android/iOS Hub app)
- Stripe, Resend, Cloudflare Stream, TTLock, TP-Link Tapo, Simulator Golf Tour API

Roughly 230 front-end TS/TSX files, 90 edge functions, 180 migrations, 100+ tables.

## Hard rules — violating these breaks production

1. **Timezone.** Every date calculation, display, report and chat answer uses
   `Australia/Brisbane` (AEST, UTC+10, no DST). Use the helpers in
   `src/lib/brisbane-time.ts`. Never call bare `toLocaleString()` / `new Date()` maths for
   business logic.
2. **Edge functions** use `npm:` imports, native `Deno.serve`, and full CORS headers on
   every response including `OPTIONS`. Webhooks set `verify_jwt = false` in
   `supabase/config.toml`.
3. **RLS + GRANTs.** Every new public-schema table needs `GRANT` statements in the same
   migration as `CREATE TABLE`, then `ENABLE ROW LEVEL SECURITY`, then policies. RLS alone
   is not enough — PostgREST returns a permission error without grants.
4. **Service role bypasses RLS.** Automated/cron edge functions use
   `SUPABASE_SERVICE_ROLE_KEY`. Never expose it client-side.
5. **Pagination.** PostgREST caps at 1,000 rows. Admin queries over large tables must use
   `.range()` batching. Aggregate counts use database triggers, not client-side counting.
6. **Never edit** `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`,
   `.env`, or `supabase/config.toml` project-level settings by hand.
7. **Idempotency.** Anything touching money is idempotent: Stripe webhook events are
   recorded in `stripe_processed_events`, checkout identifiers carry a random UUID suffix,
   and booking charges use idempotency buckets.

## Design system

Colours, fonts, gradients and shadows are semantic tokens in `src/index.css` and
`tailwind.config.ts`. Components must never hardcode `text-white`, `bg-black`, or
`bg-[#hex]`.

Birdies brand (to be replaced per client): base green `#1F4C25`, brand orange `#EC622D`,
cream `#FFF5E4`; Anton for headings, Inter for body. In league scoring, over-par is blue.

## Where things live

```text
src/pages/                 route components (public, league, admin, embeds)
src/pages/marketing/       public marketing site
src/pages/admin/           back-office
src/components/admin/      admin sub-components (settings, sgt, local-comps, ai-caddy)
src/components/booking/    booking flow UI
src/hooks/                 data hooks (useBooking, useAuth, useOperatingHours, usePricing…)
src/lib/                   brisbane-time, pricing-utils, sgt-api, range-stats, query-keys
supabase/functions/        90 edge functions
supabase/migrations/       schema history
electron/                  Bay Controller main process, Tapo bridge, OBS controller
android/                   Capacitor Android project
docs/platform/             this documentation
```
