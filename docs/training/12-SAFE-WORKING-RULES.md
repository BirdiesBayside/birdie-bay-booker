# 12 — Safe Working Rules & Assessment

## Never, under any circumstances

- Work in the live production venue project.
- Change anything that charges, refunds or emails customers without sign-off.
- Paste secrets, API keys or customer data into chat, screenshots or third-party tools.
- Store role/permission flags anywhere a user can edit them.
- Create a table without row level security and explicit grants.
- Push a client's bespoke work back into BASELINE HUB or the live venue.

## Needs sign-off before it ships

| Change | Why |
| --- | --- |
| Anything touching payments, refunds, credit or memberships | Real money, hard to unwind |
| Database schema changes | Migrations are permanent and copy forward |
| Anything that sends to customers in bulk | One mistake reaches thousands |
| Bay Controller automation timing | A wrong timer means a cold or locked bay |
| Access control and roles | Security |

## Safe by default

- Copy, styling, layout, adding an admin column, new read-only reports.
- Anything on your own scratch remix.

## Working habits

- One change per request; verify before moving on.
- Ask for a plan on anything non-trivial, and actually read it.
- Test the failure paths, not just the happy path.
- Publish deliberately. Know what's in the change before you press it.
- When you learn something the hard way, write it into `docs/platform/**` the same day.

## Final assessment

To be signed off as ready to work on a client project:

**Written / verbal**

1. Explain the whole product in five minutes with no notes.
2. Draw the moving parts diagram from memory.
3. Recite the Bay Controller timeline.
4. Answer the check-yourself questions from modules 03, 05, 06, 09 and 11.

**Practical**

5. Complete the module 10 exercise: a fictional client from remix to published, with the full
   test pass, demoed live.
6. Complete the module 11 exercise: find and correctly diagnose a planted bug.
7. Build one small new feature from a written spec on a scratch remix — including RLS, a test
   pass, and a plain-English handover note.

**Judgement (the real test)**

8. Given three change requests, correctly identify which need sign-off and why.
9. Given a customer complaint, say what you'd look at first and what you would *not* assume.

Sign-off is given by the trainer, per person, in writing.

← Back to the [index](README.md)
