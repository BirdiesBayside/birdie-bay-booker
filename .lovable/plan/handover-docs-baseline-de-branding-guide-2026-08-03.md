# Handover docs + Baseline de-branding guide

Write the full platform knowledge into this repo now, so the remix into
`BASELINE HUB` carries it. Nothing in the app changes — this adds a `docs/platform/`
folder only.

## Why this works

Memory and chat history don't travel with a remix; the repo does. Written into
`docs/platform/`, the knowledge becomes the first thing the next agent reads.

The survey of this codebase says the risk is surface area, not architecture:
bays, pricing, operating/staffed hours, POS products, email templates and
header/footer, door settings and SGT credentials are all already DB-driven.
What is genuinely Birdies-specific: `birdiesbayside.com.au` links across ~25
edge functions, sender addresses (`info@`/`noreply@`/`admin@birdiesbayside.com`),
seeded Stripe price IDs, marketing copy and brand assets, the `/bayside/*` pages,
Capacitor app id `com.birdiesbayside.hub`, and the Bay Controller release repo.

## Part 1 — Docs written into this project now

`docs/platform/README.md` — entry point; tells the agent to read 00 first.

- `00-OVERVIEW.md` — what the platform is, booking domain vs hub domain,
  actors (visitor / weekday / birdie / eagle / staff / admin), and the
  non-negotiables: Australia/Brisbane everywhere via `src/lib/brisbane-time.ts`,
  edge functions use `npm:` imports + `Deno.serve` + full CORS, roles live in
  `user_roles` with `has_role()`, every public table needs GRANTs.
- `01-BOOKING-ENGINE.md` — availability and see-through pending logic,
  peak/off-peak, deposits and credits, reschedule/cancel cut-off at T+10min,
  extensions, Stripe idempotency buckets, bay blocks, admin timetable.
- `02-BAY-CONTROLLER.md` — explicit state machine, the T-3m/T-1m/T-20s/T+0
  timeline, back-to-back bypass, baseline + customer snapshot settings restore,
  kiosk mode, watchdog, launch-loop protection, plug control via
  `tapo_control.exe`, OBS recording, tus upload, hard stop at T-120s.
- `03-MEMBERSHIPS-BILLING.md` — tiers, immediate-charge policy, tier switching
  via `subscription.update` with unchanged anchor, payment-failure ladder,
  webhook idempotency via `stripe_processed_events`.
- `04-LEAGUE-AND-COMP.md` — SGT club→tour→tournament order, 3-round provisional
  handicap and the (E) rule, monthly points scale, Ambrose handicap formula
  (25% of gap to field average, capped ±2, winner bonuses), highlights pipeline.
- `05-NOTIFICATIONS.md` — `email_layout` header/footer, the wrapper helper,
  merge tags including `{staffed_status}`, SMS templates, push.
- `06-INTEGRATIONS.md` — Stripe, Resend, Tuya door codes, Tapo plugs, Cloudflare
  Stream, SGT API, gift cards: what each needs, which settings tables drive it,
  and which secrets must be re-added per project.
- `07-TENANT-CONFIG.md` — every value a new venue must change, with file/table
  locations: domains, sender addresses, phone, brand tokens, app ids, bay count.
- `08-DEBRANDING-GUIDE.md` — the step-by-step for turning the remix into a
  neutral BASELINE HUB (Part 2 below), written as an instruction set the agent
  in that project can execute.
- `09-BAY-CONTROLLER-BUILD.md` — how to stand up the client's own Bay Controller
  installer: the GitHub Actions workflow, `electron/package.json` publish block,
  auto-increment versioning from `latest.yml`, electron-updater feed, the
  PyInstaller Tapo step, icon/product name, and exactly which fields change per
  client (repo owner/name, appId, productName, artifact name, hub domain).
  Explicitly: the workflow and Tapo login logic are kept, only the wiring changes.
- `10-ONBOARDING-RUNBOOK.md` — ordered checklist to take a client project from
  remix to live.
- `memory/` — the current project memory exported as plain markdown so the Core
  rules can be pasted into the new project's Knowledge settings.

Every doc is written from the code, stating only what the code does.

## Part 2 — What the de-branding guide will instruct (run in BASELINE HUB, not here)

Target: a neutral blank canvas that still boots and works.

1. **Tenant config** — one `tenant_settings` table + `src/config/tenant.ts`
   accessor: venue name, legal entity, booking domain, hub domain, support phone
   and email, sender addresses, address, ABN, socials. No literals in components.
2. **Edge functions** — replace every `birdiesbayside.com.au` and
   `@birdiesbayside.com` literal across all 90 functions with tenant values.
3. **Marketing site** — neutral copy, placeholder imagery, brand tokens in
   `index.css`/`tailwind.config.ts` reset to a neutral palette, legal pages with
   the venue name injected.
4. **Strip Birdies assets** — `public/bayside/*`, the codebase audit page,
   Birdies logos/video, `public/birdies-guide.html`, Android package rename off
   `com.birdiesbayside.hub`, `google-services.json` removed.
5. **Empty the commercial layer** — no Stripe products or price IDs, no
   membership tiers seeded, `pricing_config` empty, `MEMBERSHIP_TIERS` in
   `src/types/booking.ts` reduced to a data-driven empty default, gift cards and
   POS products cleared. Admin still lets a client create tiers and pricing from
   scratch, and the app degrades gracefully with zero tiers (visitor-only).
6. **Data cleanse** — a `baseline_reset` migration truncating all transactional
   tables (profiles, bookings, payments, orders, recordings, SGT data, door
   codes, notifications) so Baseline ships with zero real people or money.
7. **Seed only structure** — 6 placeholder bays, 5am-11pm operating hours,
   default email templates + header/footer, default door access settings.
8. **Setup Status page** in Admin — red/green list of every required tenant
   setting, secret and integration so a client project can be brought live
   without guessing.

## Technical notes

- The Birdies GitHub repo and its Actions workflow stay exactly as they are; the
  client's project gets its own repo and release channel, built from the same
  workflow with the publish block repointed.
- Secrets never travel with a remix — Stripe, Resend, Tuya, Cloudflare, SGT and
  push credentials are re-added per project.
- Nothing in Part 1 touches application code. Part 2 is documentation here and
  execution only in BASELINE HUB.
