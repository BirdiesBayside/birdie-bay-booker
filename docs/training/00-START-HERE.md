# 00 — Start Here

## What you are being trained to do

Take this platform — a full indoor golf venue system — and stand up a working copy of it for a new
client venue. That means remixing the project, stripping the previous venue's identity out of it,
configuring the new venue, connecting their accounts, testing it, and handing it over. Then
supporting it when something goes wrong.

You will do nearly all of this by talking to the Lovable agent in chat. You do not need to be able
to write React or SQL from scratch. You **do** need to understand what the system does well enough
to describe changes precisely and to spot when the agent has done something wrong.

## The golden rules

1. **Never work in the live venue project.** Birdies Bayside is production. Real customers, real
   money. You work in a scratch remix or a client project.
2. **Read the reference doc for an area before you change it.** `docs/platform/00-OVERVIEW.md`
   first, then the doc for that area. The rules in there were learned the hard way.
3. **Improvements flow one direction only:** Birdies → BASELINE HUB → client projects. Never port
   a client's custom work back up the chain.
4. **Anything touching money, schema, or customer emails needs sign-off** before it ships. See
   module 12.
5. **When you don't know, look at the actual data.** Don't guess a cause. Module 11 covers how.

## How each module works

Every module in Phase 2 has the same shape:

```text
What the customer sees
What the admin sees
What happens behind the scenes
Rules that must not be broken
Common failures (real ones, and how they were fixed)
Exercise
Check yourself
```

## What "done" looks like for a module

You can explain the area to the trainer in your own words without notes, you've completed the
exercise on your scratch remix, and you can answer the check-yourself questions.

## Vocabulary

If a word is unfamiliar, it's in the [GLOSSARY](GLOSSARY.md). Look it up rather than nodding along —
half of this job is describing things accurately to the agent.

→ Next: [01 — What This Product Actually Is](01-WHAT-THIS-PRODUCT-IS.md)
