# 07 — The Admin Hub

Reference: `docs/platform/00-OVERVIEW.md` (actors and access) and `docs/platform/07-TENANT-CONFIG.md`

The admin hub is where staff run the venue. It is the part clients judge you on, because it's the
part they use every day.

## The sections

| Section | What staff do there |
| --- | --- |
| Timetable | The day's grid of bays and bookings. Add, move, block, note. |
| Customers | Search a customer, see bookings, credit, membership, notes. Import/export CSV. |
| Analytics | Revenue trends, utilisation, day/hour heatmaps, how customers heard about the venue. |
| Marketing | Campaigns, segments, promos, loyalty. |
| POS | Food and drink orders to the bay, payment by credit/account/cash, daily reconciliation. |
| Settings | Operating and staffed hours, pricing, email layout and templates, SMS templates, door access, public holidays. |
| Bay Control | Live bay status, auto/manual mode, controller logs. |
| League / Comps | Optional — see module 08. |

## Access control

Staff access is granted through a dedicated roles table and checked server-side. Two things follow:

- **Never** decide "is this person an admin?" from anything stored in the browser.
- **Never** put a role column on the profiles table. It is a privilege-escalation hole.

## Settings is where the tenant lives

Nearly everything venue-specific — hours, prices, phone number, email branding, holidays — is
configuration in Settings rather than hardcoded values. That is what makes a remix quick. When you
find a venue-specific value hardcoded in a component, that's a bug to raise, not something to copy
into the next client.

## Rules that must not be broken

- Admin lists that can exceed 1,000 rows must page (same trap as module 06).
- Expensive counts (like total bookings per customer) come from maintained aggregates, not from
  counting rows on every page load.
- Destructive actions (delete customer, refund, credit adjustment) must be logged and, where they
  touch payment providers, must cascade properly rather than leaving orphans.

## Common failures

| Symptom | Real cause |
| --- | --- |
| Customer list stops at 1,000 | Unpaged query |
| Admin page slow to load | Counting rows live instead of using an aggregate |
| Deleted customer still exists somewhere | Delete didn't cascade across database, auth and payment provider |

## Exercise

On your scratch remix:

1. Create a staff user and confirm a non-staff user cannot reach the admin hub.
2. Change operating hours and confirm the timetable and booking grid both respect it.
3. Add a small column to one admin table (e.g. show a customer's credit balance in the list) and
   ship it to preview.

## Check yourself

- Why is a role column on the profiles table dangerous?
- Name three things that should be Settings rather than code.
- What makes an admin page slow, and what's the usual fix?

→ Next: [08 — League, Comps & Highlights](08-LEAGUE-AND-COMPS.md)
