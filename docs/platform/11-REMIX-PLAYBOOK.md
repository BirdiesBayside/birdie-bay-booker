# 11 — Remix Playbook (Birdies → BASELINE HUB → Client)

This is the operator's checklist. It covers *how* to remix, *what to paste* into the new
project so the agent has context, and *what order* to do the work in.

Lineage: **Birdies (live)** → remix → **BASELINE HUB** (neutral, no data) → remix per
client → **Client Hub**. Improvements only ever flow downward.

---

## Stage 0 — Before you remix (do this in Birdies)

- [ ] `docs/platform/` is complete and current (00–11 + `memory/CORE-RULES.md`).
- [ ] Latest work is committed / the project builds cleanly.
- [ ] Note that **secrets do not travel**: Stripe, Resend, TTLock, Cloudflare, SGT, push
      credentials must be re-added in each new project.
- [ ] Note that **project memory and chat history do not travel**. The repo does.

## Stage 1 — Remix into BASELINE HUB

1. Project name (top-left) → **Settings** → **Remix this project**, or right-click the
   project in the sidebar → **Remix**.
2. Target the **Bayside Golf** (Business) workspace.
3. Name it `BASELINE HUB`.
4. Open it. Confirm `docs/platform/` is present and the app builds.

### First message to paste into BASELINE HUB

> This project is a remix of a live indoor golf platform. Before doing anything else, read
> `docs/platform/README.md`, then `docs/platform/00-OVERVIEW.md`, then
> `docs/platform/07-TENANT-CONFIG.md` and `docs/platform/08-DEBRANDING-GUIDE.md` in full.
> Do not guess at behaviour that those docs describe.
>
> Then save the contents of `docs/platform/memory/CORE-RULES.md` into project memory as
> Core rules, one rule per line, so they apply to every future message.
>
> Then give me a short summary of: what this platform does, the hard rules you must never
> break, and the 10 steps of the de-branding guide. Do not change any code yet.

Also paste `docs/platform/memory/CORE-RULES.md` into **Project Settings → Knowledge**
manually — belt and braces, so it loads even in a fresh session.

## Stage 2 — De-brand BASELINE HUB

Work through `08-DEBRANDING-GUIDE.md` **one step per message**, verifying each before
moving on. Do not ask for all ten at once.

Prompt per step:

> Execute Step N of `docs/platform/08-DEBRANDING-GUIDE.md`. Only that step. When done,
> list exactly what changed and how I can verify it, then stop.

Order and gates:

| Step | Gate before moving on |
| --- | --- |
| 1 Tenant config | `tenant_settings` row editable in Admin → Settings → Venue Details |
| 2 Purge literals | `rg -i 'birdies\|bayside' src supabase electron index.html` is clean |
| 3 Neutralise brand | Marketing site renders with placeholder copy/imagery |
| 4 Delete Birdies assets | `public/bayside/` gone, questionnaire function gone |
| 5 Empty commercial layer | App loads with zero tiers, zero pricing, zero products |
| 6 Data cleanse | Every table in the truncate list returns 0 rows; auth users cleared |
| 7 Seed structure | 6 bays, 05:00–23:00 hours, default templates present |
| 8 Setup Status page | Admin → Setup Status shows an all-red checklist |
| 9 Docs carry-over | `07-TENANT-CONFIG.md` updated for anything now DB-driven |
| 10 Verification | Sign up → book → pay → email works on Admin-entered config only |

Then, in BASELINE HUB, update this playbook's Stage 3 if anything about the process
changed, and **freeze it**: BASELINE HUB is never used by a real venue and never holds
real data.

## Stage 3 — Remix BASELINE HUB per client

1. Remix `BASELINE HUB` → name it `<Client> Hub`.
2. Re-add secrets for that client (see `06-INTEGRATIONS.md` for the full list).
3. Work through `10-ONBOARDING-RUNBOOK.md`.

### First message to paste into a client project

> This project is a remix of BASELINE HUB, a de-branded indoor golf venue platform. Before
> doing anything else, read `docs/platform/README.md`, `00-OVERVIEW.md`,
> `07-TENANT-CONFIG.md` and `10-ONBOARDING-RUNBOOK.md` in full.
>
> Then save `docs/platform/memory/CORE-RULES.md` into project memory as Core rules, and
> add these client Core rules on top:
> - Venue: `<venue name>`, `<suburb, state>`, timezone `<IANA timezone>`.
> - Booking domain `<domain>`, hub domain `<hub domain>`.
> - Bays: `<n>`. Staffed hours: `<yes/no + hours>`.
> - Integrations in use: `<Stripe / Resend / TTLock / Tapo / Cloudflare / SGT / push>`.
>
> Then run through `10-ONBOARDING-RUNBOOK.md` and tell me which items you can do yourself
> and which need something from me. Do not change any code yet.

## Keeping context alive in every generation

The four mechanisms, in order of durability:

1. **`docs/platform/` in the repo** — the only thing that survives a remix automatically.
   Whenever you change how the platform *works*, update the matching doc in the same turn.
2. **`memory/CORE-RULES.md` → project Knowledge** — paste on day one of every new project.
3. **Project memory** — the agent saves rules as you work; it starts empty in a remix.
4. **This playbook** — re-read at the start of each remix.

Rule of thumb for every project in the lineage: *if a future agent would break something
by not knowing it, it belongs in `docs/platform/`, not in chat.*

## Timezone warning

Birdies is `Australia/Brisbane` (no DST) and the code assumes that everywhere via
`src/lib/brisbane-time.ts`. A client in a DST state (NSW, VIC, SA) **must** have this
audited before go-live — see `07-TENANT-CONFIG.md`. Treat it as a blocking item, not a
polish item.

## Bay Controller per client

The Birdies GitHub repo and its Actions workflow stay as they are. Each client gets their
own repo and release channel built from the same workflow with the publish block
repointed — full instructions in `09-BAY-CONTROLLER-BUILD.md`.
