# Training Module: Onboarding a New Platform Developer

A written, self-paced course that sits in the repo at `docs/training/` alongside the existing
handover docs. It assumes zero knowledge of this codebase and near-zero backend knowledge, and
teaches someone to build and ship a client venue hub using Lovable on a remix of this project.

The existing `docs/platform/**` pack is the reference manual (deep, technical). Training is the
teaching layer: plain English, ordered, with exercises. Training links into the reference docs
instead of duplicating them.

## Structure: 12 modules, three phases

### Phase 1 — Orientation (before touching anything)

**00 — Start Here**
How to use the course, what "done" looks like per module, the golden rules (never work in the
live Birdies project, never port client work back up the chain, always read the reference doc
before changing an area).

**01 — What This Product Actually Is**
The business in plain terms: an indoor golf venue sells bay time; the platform sells it, takes the
money, unlocks the door, powers the bay on, runs the golf software, and runs the leagues.
Walkthrough of the live site as a customer, then as an admin.

**02 — How Lovable Builds Software**
For someone who has never used it: chat-driven building, the preview, what the agent can and
can't see, how to describe a change well, when to ask for a plan first, why small changes beat
big ones. How project Knowledge/memory works and why `memory/CORE-RULES.md` gets pasted in.

**03 — The Moving Parts**
One page per concept, no jargon: frontend pages, database tables, rows and columns, row-level
security ("who is allowed to see this row"), edge functions ("small programs that run on the
server"), cron jobs, secrets, Stripe, email/SMS providers, the Windows app. A diagram showing
which part talks to which.

### Phase 2 — The Sections (one module per area of the app)

Each follows the same shape: what the customer sees → what the admin sees → what happens behind
the scenes → the rules that must not be broken → common failures and how they were fixed →
exercise → check-yourself questions.

**04 — Bookings & Availability** (peak/off-peak, credits, see-through pending, reschedule/cancel
rules, Brisbane-time discipline)
**05 — Money: Memberships, Stripe & Credits** (tiers, immediate charge, failed-payment ladder,
idempotency, refunds)
**06 — Notifications: Email, SMS, Push** (body-only templates, global header/footer, merge tags,
suppression lists, campaign paging)
**07 — The Admin Hub** (timetable, customers, settings, POS, analytics, roles and why roles never
live on the profile table)
**08 — League, Comps & Highlights** (SGT sync, handicaps, Ambrose, recording pipeline — flagged as
optional/advanced for most clients)
**09 — The Bay Controller** (the Windows app: automation timeline, plugs, kiosk, why single
instance, reading the logs first; links to `docs/bay-controller-product/**`)

### Phase 3 — Doing the Job

**10 — Remix to Live: the Client Build**
The actual job, end to end: remix → de-brand → tenant config → accounts and secrets → seed data →
test pass → publish → handover. Wraps `08-DEBRANDING-GUIDE`, `10-ONBOARDING-RUNBOOK`,
`11-REMIX-PLAYBOOK` into a single narrative with checkboxes.

**11 — Debugging & Support**
How to investigate without guessing: read the logs, read the actual database rows, reproduce it,
then fix. Timezone traps, the 1,000-row query limit, webhook duplicates, "it says sent but nothing
arrived". A worked example from real history.

**12 — Safe Working Rules & Assessment**
What needs your sign-off (schema changes, anything touching money, anything that emails
customers), Git/publish etiquette, and a final practical: build a small feature on a scratch
remix from spec to publish.

## Supporting files

- `docs/training/README.md` — index, suggested pace (roughly 2 weeks part-time), prerequisites.
- `docs/training/GLOSSARY.md` — every term used, one line each (RLS, edge function, webhook,
  idempotency, cron, migration, tenant, remix, merge tag).
- `docs/training/EXERCISES.md` — the hands-on tasks collected in one place, each with a definition
  of done, all performed on a scratch remix, never on Birdies.
- `docs/training/TRAINER-NOTES.md` — your side: what to demo live, what to ask them, red flags
  that mean they aren't ready to touch a client project yet.

## Notes

- Documentation only: no application code, schema, or edge functions change.
- Written against the current codebase and the real incident history, so examples are true.
- Reference docs stay authoritative; training never restates rules that could drift, it links.

## Open choices (tell me if you want it different)

- Length: aiming for punchy modules (roughly 1–2 pages each), not exhaustive essays.
- Format: markdown in the repo. Could also be surfaced as an in-app `/training` page later.
- Module 08 (League/Comps) can be marked optional if the hire won't touch league clients.
