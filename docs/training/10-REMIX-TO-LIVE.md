# 10 — Remix to Live: the Client Build

References: `docs/platform/11-REMIX-PLAYBOOK.md`, `docs/platform/08-DEBRANDING-GUIDE.md`,
`docs/platform/07-TENANT-CONFIG.md`, `docs/platform/10-ONBOARDING-RUNBOOK.md`,
`docs/platform/06-INTEGRATIONS.md`

This is the job. Everything before this module was so you could do this module safely.

## The lineage (do not break it)

```text
Birdies Bayside (live production, never de-branded)
        │  remix
        ▼
BASELINE HUB (neutral, no real data, never used by a venue)
        │  remix, once per client
        ├──► Client A
        └──► Client B
```

Improvements flow downward only, deliberately. Never push a client's custom work back up.

## The eight steps

**1. Remix.** Remix BASELINE HUB, not Birdies. Name the project for the client.

**2. Seed the agent's knowledge.** Paste `docs/platform/memory/CORE-RULES.md` into project
Knowledge before your first build request. This is step two for a reason.

**3. De-brand and re-brand.** Follow `08-DEBRANDING-GUIDE.md`: colours and fonts as design tokens,
logo, site copy, app name, page titles and meta descriptions, email header/footer, Welcome Window
text, installer name and app id.

**4. Tenant configuration.** Work `07-TENANT-CONFIG.md` top to bottom: timezone, operating hours,
staffed hours, number of bays, pricing and peak windows, membership tiers, contact phone, address,
public holidays, terms.

**5. Accounts and secrets.** From `06-INTEGRATIONS.md`, the client needs their own: payment
account, email sending domain, SMS account, door lock / gate accounts, smart plug accounts, and
any league service. Collect keys and add them as secrets. Never in code, never in chat.

**6. Bay Controller.** Create the client's app repo and release channel, build the installer, pair
each bay PC, configure plugs, run a live dry run of the whole timeline on one bay.

**7. Test pass.** Do not skip this list:

```text
[ ] Sign up, log in, reset password
[ ] Book, pay, receive email + SMS, receive door code
[ ] Reschedule, cancel, extend
[ ] Membership signup, tier switch, failed payment, cancellation
[ ] Credit: grant, spend, refund, ledger correct
[ ] Admin: timetable, add booking, block, customer record, settings save
[ ] Bay Controller: full timeline on a real bay, both auto and manual mode
[ ] Emails and SMS carry the client's branding, not ours
[ ] Non-staff user cannot reach admin
[ ] Security scan run and clean
```

**8. Publish and hand over.** Custom domain, publish, then train the client's staff and give them
a short operations note covering: adding a booking, blocking a bay, changing prices, issuing
credit, and putting a bay in manual mode.

## What usually goes wrong

- Skipping step 2, then spending a week re-fixing solved bugs.
- Hardcoded venue values discovered late. If you find one, fix it as configuration, and tell the
  trainer so BASELINE HUB gets the same fix.
- Client accounts not ready. Chase the third-party accounts on day one; they gate everything.
- Testing only the happy path. Failures are where the money is lost.

## Exercise

Build a fictional client venue end to end on a scratch remix, with the full test pass, and demo it
to the trainer. This is the main practical of the course.

## Check yourself

- Why remix BASELINE HUB instead of the live venue?
- What is the very first thing you do inside a fresh remix?
- Name five things that must be swapped out during de-branding.

→ Next: [11 — Debugging & Support](11-DEBUGGING.md)
