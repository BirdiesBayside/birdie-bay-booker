# 02 — How Lovable Builds Software

## The basic loop

You type what you want in chat. The agent reads the codebase, edits files, and the live preview
updates. You look at the result, and either accept it or describe what's wrong. That's the job.

You are not "prompting a chatbot" — you are directing a developer who is fast, literal, has
perfect recall of the files it has read, and no idea what's in your head.

## What the agent can and cannot see

**Can see:** every file in the project, the database schema and data, edge function logs, the
browser console and network requests from your preview, and anything you paste.

**Cannot see:** your screen, what you meant, decisions made in a previous project, or anything
that happened in a chat it wasn't part of. **A remix does not carry chat history.** That is exactly
why `docs/platform/**` exists — the repo survives, the conversation doesn't.

## How to describe a change well

| Weak | Strong |
| --- | --- |
| "The booking page is broken" | "On /booking, picking 7pm Friday shows $35 but peak should be $40. Screenshot attached." |
| "Add a report" | "In Admin → Analytics, add a table of bookings per bay for a chosen date range, with totals." |
| "Make it look better" | "Tighten the spacing on the membership cards and make the tier name the most prominent element." |

Rules of thumb:

- Say **where** (page, section, admin tab), **what**, and **what it should look like when right**.
- Paste the actual error text, not a description of it.
- One change at a time. A message with six unrelated requests gets six mediocre results.
- For anything big or risky, ask for a **plan first**: "don't build it yet, show me the plan."

## Plan mode vs build mode

Plan mode makes the agent explore and propose before writing code. Use it for anything touching
money, schema, or more than a couple of files. Build mode is for clear, contained changes.

## Preview, publish, and the difference

The **preview** is your working copy — only you see it. **Publish** pushes it to the real URL that
customers use. Publishing is a deliberate act. Nothing reaches customers until you publish.

## Knowledge and memory

Each project has a Knowledge/memory area holding always-on rules — brand colours, timezone rules,
"never do X". The agent applies these to every request without being reminded.

When you start a new client project, paste `docs/platform/memory/CORE-RULES.md` into Knowledge as
the first thing you do. If you skip it, the agent will happily reintroduce bugs that were fixed
two years ago.

## When the agent gets it wrong

- Tell it what's actually happening, not just "still broken".
- If it loops on the same failure three times, stop and change approach: ask it to explain what it
  thinks is happening first, or break the change into smaller pieces.
- If it changed things you didn't ask for, say so explicitly and ask it to revert those.

## Exercise

On your scratch remix:

1. Make a tiny, clear change ("on the marketing home page, change the hero heading to X").
2. Make a deliberately vague request and see what you get. Compare the two.
3. Ask for a plan for a medium feature, read it, and reject it with specific feedback.

## Check yourself

- Why does a remix lose chat history but keep the docs?
- When would you use plan mode instead of just asking for the change?
- What three things should almost every change request contain?

→ Next: [03 — The Moving Parts](03-THE-MOVING-PARTS.md)
