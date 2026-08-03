# Baseline Hub: remix-ready platform + context handover

Goal: produce a clean, re-usable "BASELINE HUB" copy of this platform that a new
client project can be remixed from, without the Birdies-specific wiring — and
without losing the accumulated knowledge that makes work in this project reliable.

## What the survey of this codebase actually shows

- 231 TypeScript/React files, 90 edge functions, 180 migrations.
- 150 files mention "Birdies" by name.
- Core operational data is already config-driven, not hardcoded: bays, pricing,
  operating/staffed hours, POS products, email templates, email header/footer,
  door access settings and SGT club credentials all live in database tables.
- What *is* hardcoded and would break or embarrass a client:
  - `birdiesbayside.com.au` links inside ~25 edge functions (emails, Stripe
    redirects, password reset, marketing).
  - Sender/recipient addresses: `info@`, `noreply@`, `admin@birdiesbayside.com`
    (41 + 7 + 7 occurrences).
  - Stripe membership price IDs seeded in an old migration.
  - Marketing site copy, brand colours, fonts, logos, legal pages, and the
    `/bayside/*` static pages (Sam's own lead-gen assets — should not ship).
  - Hub vs booking domain detection (`isHubHost()`), Capacitor app id
    `com.birdiesbayside.hub`, Electron/Bay Controller GitHub release repo.

So the risk is real but it is mostly **surface area, not architecture**. The
booking engine, bay automation state machine, membership billing and SGT logic
are generic; they are parameterised by DB rows, not by "Birdies".

## Recommended sequence

1. **Harden context in this project first** (below) so the remix carries it.
2. Remix → `BASELINE HUB` in the Bayside Golf workspace.
3. Do the de-branding work **in BASELINE HUB**, not here — Birdies keeps running
   untouched, and Baseline becomes the generic product.
4. Remix BASELINE HUB per client; run the onboarding runbook.
5. When Birdies gains a feature worth productising, port it into BASELINE HUB
   deliberately (never the reverse).

## Part A — Context handover (do this before remixing)

Memory and chat history do not travel with a remix; the repo does. So the
knowledge has to be written **into the repo** as files the next agent will read.

Create `docs/platform/` containing:

- `00-OVERVIEW.md` — what the platform is, the two domains (booking vs hub),
  who the actors are (visitor, member tiers, staff, admin), and the
  non-negotiables (Brisbane timezone everywhere, no bare `toLocaleString`,
  edge functions use `npm:` imports + `Deno.serve` + CORS).
- `01-BOOKING-ENGINE.md` — availability rules, see-through pending logic,
  peak/off-peak, deposits/credits, reschedule + cancel cut-offs (live at
  T+10min), extensions, idempotency buckets for Stripe.
- `02-BAY-CONTROLLER.md` — the explicit state machine, the T-3m/T-1m/T-20s/T+0
  timeline, back-to-back bypass, settings baseline + customer snapshot restore,
  kiosk mode, watchdog, launch-loop protection, OBS recording + tus upload,
  hard-stop at T-120s.
- `03-MEMBERSHIPS-BILLING.md` — tiers, immediate charge policy, tier switching
  via `subscription.update` with unchanged anchor, payment-failure ladder,
  webhook idempotency via `stripe_processed_events`.
- `04-LEAGUE-AND-COMP.md` — SGT integration order (club → tour → tournament),
  3-round provisional handicap and the (E) rule, monthly points scale, Ambrose
  handicap formula (25% of gap to field average, capped ±2, winner bonuses).
- `05-NOTIFICATIONS.md` — email layout table, wrapper helper, merge tags
  including `{staffed_status}`, SMS templates, push.
- `06-INTEGRATIONS.md` — Stripe, Resend, Tuya door codes, Tapo plugs,
  Cloudflare Stream, SGT API, Shopify gift cards: what each needs and which
  secrets/settings tables drive them.
- `07-TENANT-CONFIG.md` — the single source of truth for everything a new
  client must change (see Part B).
- `08-ONBOARDING-RUNBOOK.md` — ordered checklist to stand up a new venue.

Also export the current project memory (the `mem://` index and its files) into
`docs/platform/memory/` as plain markdown, and add a short `README` pointing the
agent at `docs/platform/00-OVERVIEW.md` first. In the remixed project, paste the
Core rules into Project Settings → Knowledge so they load on every message.

These docs are written from the code, not from recollection: each one is
produced by reading the relevant files and stating only what the code does.

## Part B — De-Birdies-ification (performed in BASELINE HUB)

1. **Tenant config table + `src/config/tenant.ts`** — venue name, legal entity,
   public domain, hub domain, support phone, support email, sender addresses,
   address/geo, ABN, social links, brand colours/fonts. One typed accessor used
   everywhere; no literals in components.
2. **Edge functions** — replace every `birdiesbayside.com.au` and
   `*@birdiesbayside.com` literal with values read from the tenant config /
   `system_settings`, falling back to an env var. Audit all 90 functions.
3. **Marketing site** — reduce to a neutral template: generic copy, placeholder
   imagery, tokenised brand colours, tenant-driven contact details, and legal
   pages (terms, privacy, media-consent clause) with the venue name injected.
4. **Remove Birdies-only assets** — `public/bayside/*`, the codebase audit page,
   Birdies logos, SGT club credentials, Tuya device IDs, real Stripe price IDs,
   GitHub release repo for the Bay Controller, Capacitor app id + Android
   signing config.
5. **Seed data instead of Birdies data** — a `baseline_seed` migration creating
   sensible defaults (bays 1-6 placeholder, 5am-11pm operating hours, example
   pricing, default email templates and header/footer) so a fresh project boots
   into a working, obviously-placeholder state.
6. **Data cleanse** — the remix carries a copy of the database. Baseline must
   ship with zero real customers, bookings, payments, recordings, SGT members or
   door codes. A `baseline_reset` script truncates transactional tables and
   leaves only config + templates.
7. **Config completeness check** — a small admin "Setup Status" page listing
   each required tenant setting and integration with a red/green state, so a new
   client project can be brought live without guessing.

## Technical notes

- Nothing in Part A changes application behaviour; it is documentation plus a
  README pointer.
- Part B item 6 is destructive by design and only ever runs in BASELINE HUB,
  never here.
- Bay Controller binaries are per-client: each client project needs its own
  GitHub repo/release channel and its own auto-update feed.
- Secrets never travel with a remix — every client project re-adds Stripe,
  Resend, Tuya, Cloudflare, SGT and push credentials.

## What I need from you before starting

Confirm whether Part A (the handover docs) should be written into **this**
project now — it adds a `docs/platform/` folder here and changes no code — or
whether you'd rather remix first and have me write the docs inside BASELINE HUB.
Writing them here is the safer option, because right now I have full context.
