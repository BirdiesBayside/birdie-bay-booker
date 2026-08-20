# 11 — Debugging & Support

The single most valuable habit in this job: **do not guess the cause. Go and look.**

## The method

```text
1. Get the facts        Who, what, exactly when (local time), which bay/booking/customer
2. Look at the data     Read the actual rows involved. Not the code. The rows.
3. Read the logs        Edge function logs, controller logs, provider dashboards
4. Reproduce            On a scratch remix, with the same conditions
5. Diagnose             State the cause in one sentence, and check it explains ALL the symptoms
6. Fix the category     Not just this instance — find the sibling paths with the same assumption
7. Verify               Re-run the scenario. "It should work now" is not verification.
```

If your explanation doesn't account for every detail of the report, it's the wrong explanation.

## Where to look for what

| Problem | First place |
| --- | --- |
| Booking looks wrong | The booking row itself, then the timezone helpers |
| Email/SMS not received | Send logs, then suppression/unsubscribe status, then the provider |
| Payment wrong | Payment provider dashboard, then the webhook function logs |
| Bay didn't power on / apps didn't launch | Bay Controller logs for that bay and window |
| Page blank or erroring | Browser console and network tab |
| Something ran twice | Webhook/event logs — look for a retried event |

## The recurring traps (memorise these)

1. **Timezone.** Anything a day out is almost always a date built without the venue timezone
   helper.
2. **The 1,000-row cap.** Any list that "stops" or a count suspiciously near 1,000.
3. **Duplicate webhook events.** Providers retry. Handlers must be idempotent.
4. **Silent failures.** A green "sent" toast that fires before the send actually resolves.
5. **Stale timers.** Something scheduled minutes ago acting on data that has since changed —
   especially in the Bay Controller.
6. **Realtime alone.** Live updates can be missed; anything critical needs a polling fallback.

## Worked example

**Report:** "The Sim Cup campaign should have gone to 1,400 customers, but Sam didn't get it."

- Fact-check: how many were actually sent? The log said 936.
- 936 is suspiciously close to 1,000 → trap 2.
- Read the send code: recipients were fetched in a single query, capped at 1,000 rows, then
  filtered.
- Cause: 464 customers were never in the list. It explains everything — no error, no bounce,
  just absent.
- Fix the category: add paging to the recipient fetch, and check other admin lists with the same
  pattern.
- Recover: send to the 464 who were missed.
- Verify: count sent versus intended, confirm zero failures.

## Support etiquette

- Acknowledge fast, diagnose properly, then report the cause in plain English to the client.
- If money moved incorrectly, escalate to the trainer before touching anything.
- Every real incident that teaches something goes into the reference docs. That's how the docs got
  good.

## Exercise

The trainer will break something on your scratch remix without telling you what. Find it using the
method above and write a three-line incident note: symptom, cause, fix.

## Check yourself

- What does a number near 1,000 make you suspect?
- Why isn't "I changed it and it looks fine" verification?
- What does "fix the category, not the instance" mean here?

→ Next: [12 — Safe Working Rules & Assessment](12-SAFE-WORKING-RULES.md)
