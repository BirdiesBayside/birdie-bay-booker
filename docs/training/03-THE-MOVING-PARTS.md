# 03 — The Moving Parts

Everything in the system is one of about ten things. Learn these ten and the codebase stops being
intimidating.

## The map

```text
                 ┌──────────────────────────┐
   Customer ───► │  Frontend (React pages)  │ ◄─── Staff (admin hub)
                 └───────────┬──────────────┘
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
      ┌───────────────┐            ┌────────────────────┐
      │   Database    │            │  Edge functions    │
      │ (tables+RLS)  │ ◄────────► │ (server-side code) │
      └───────────────┘            └─────────┬──────────┘
                                             │
        ┌──────────────┬──────────────┬──────┴───────┬─────────────┐
        ▼              ▼              ▼              ▼             ▼
     Stripe         Email          SMS           Door locks     Golf/league
    (payments)     provider      provider        + gate          services
                                             
                 ┌──────────────────────────┐
   Bay PC ─────► │  Bay Controller (Windows)│ ──► smart plugs, golf software
                 └──────────────────────────┘
                        reads the schedule from the database
```

## The parts, in plain English

**Frontend / pages.** The screens. Each page is one file under `src/pages/`. Reusable chunks live
in `src/components/`. Anything the user sees is here.

**Database.** A set of **tables**. A table is a spreadsheet: **columns** are the fields
(`start_time`, `email`), **rows** are the records (one booking, one customer). Tables reference
each other by id — a booking row holds the id of the customer row.

**Row Level Security (RLS).** Rules on each table answering "who is allowed to see or change this
row?". Without it, anyone could read every customer's data. Typical rule: a customer can read rows
where the row's user id equals their own; staff can read everything.

**Roles.** Who is an admin is stored in its own dedicated table — never as a column on the user's
profile. If it lived on the profile, a customer could edit their own row and make themselves an
admin. This rule is absolute.

**Edge functions.** Small programs that run on the server, not in the browser. Used for anything
that must be trusted or secret: charging a card, sending email, talking to a third party. Each one
is a folder in `supabase/functions/`.

**Migrations.** A recorded change to the database structure (add a table, add a column). They run
once and are kept forever, so any copy of the project can rebuild the same structure.

**Cron jobs.** Scheduled tasks — "run this edge function every day at 6am". Used for nightly
syncs, monthly cleanups, reminder emails.

**Secrets.** Passwords and API keys for third-party services, stored server-side. Never in the
frontend code, never pasted into chat.

**Webhooks.** A third party calling *us*. Stripe says "this payment succeeded" by calling our
webhook edge function, which then updates our database.

**Storage.** File storage — video highlights, settings snapshots, uploaded images.

**The Bay Controller.** A Windows desktop app installed on each bay PC. It reads the schedule and
physically controls the bay. Covered in module 09.

## Where things live in the repo

| Path | What |
| --- | --- |
| `src/pages/` | Screens |
| `src/pages/admin/` | Admin hub screens |
| `src/components/` | Reusable UI pieces |
| `src/hooks/` | Shared logic used by pages |
| `src/lib/` | Helper functions (e.g. timezone helpers) |
| `src/integrations/supabase/` | Auto-generated backend client — never hand-edit |
| `supabase/functions/` | Edge functions |
| `electron/` | The Windows Bay Controller app |
| `docs/` | The reference manual and this course |

## One rule you'll meet everywhere: time

All date logic uses the venue's timezone explicitly (Brisbane, UTC+10, no daylight saving) via the
helpers in `src/lib/brisbane-time.ts`. Never plain date formatting. Getting this wrong produces
bookings that appear on the wrong day — it has happened, more than once.

## Exercise

Open the repo and find, without help: the booking page, the admin timetable, the Stripe webhook
edge function, and the timezone helper. Then describe out loud what happens, part by part, when a
customer clicks "Pay" on a booking.

## Check yourself

- Why can't a card be charged from the frontend?
- What is RLS protecting against, in one sentence?
- Why are roles kept in a separate table?

→ Next: [04 — Bookings & Availability](04-BOOKINGS.md)
