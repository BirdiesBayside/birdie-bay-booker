# Platform Handover Documentation

**If you are an AI agent working on this project: read `00-OVERVIEW.md` first, then the
document covering the area you are changing. Do not guess at behaviour described here.**

This folder is the durable knowledge base for the indoor golf platform originally built
as **Birdies Bayside**. It exists because project memory and chat history do not survive
a remix — but the repository does. Everything an agent needs to work safely on a copy of
this platform is written down here.

## Reading order

| Doc | Covers |
| --- | --- |
| `00-OVERVIEW.md` | Architecture, domains, actors, hard rules. **Always read.** |
| `01-BOOKING-ENGINE.md` | Availability, pricing, payments, reschedule/cancel/extend |
| `02-BAY-CONTROLLER.md` | Windows Electron app, automation state machine, plugs, recording |
| `03-MEMBERSHIPS-BILLING.md` | Tiers, Stripe subscriptions, failures, webhooks |
| `04-LEAGUE-AND-COMP.md` | SGT league integration, handicaps, Ambrose comps, highlights |
| `05-NOTIFICATIONS.md` | Email layout/templates, SMS, push, merge tags |
| `06-INTEGRATIONS.md` | Every third-party service and the secrets it needs |
| `07-TENANT-CONFIG.md` | Every Birdies-specific value and where it lives |
| `08-DEBRANDING-GUIDE.md` | How to turn a remix into a neutral BASELINE HUB |
| `09-BAY-CONTROLLER-BUILD.md` | GitHub repo, Actions workflow, EXE + auto-update per client |
| `10-ONBOARDING-RUNBOOK.md` | Remix → live checklist for a new client venue |
| `memory/CORE-RULES.md` | The always-on rules to paste into project Knowledge |

## Project lineage

```text
Birdies Bayside (live, production)
        │  remix
        ▼
BASELINE HUB  ── de-branded, neutral, no Stripe/pricing/memberships/data
        │  remix (once per client)
        ├──► Client A Hub
        ├──► Client B Hub
        └──► ...
```

Rules of the lineage:

- Birdies stays the R&D and production venue. It is never de-branded.
- BASELINE HUB is never used by a real venue and never holds real data.
- Improvements flow **Birdies → BASELINE HUB → new clients**, deliberately and manually.
  Never port client-specific work back up the chain.
