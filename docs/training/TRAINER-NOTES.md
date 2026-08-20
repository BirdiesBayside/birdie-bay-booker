# Trainer Notes

For the person running the training. Not for the trainee.

## Before day one

- Create their Lovable account and add them to the team.
- Create a **scratch remix** for them from BASELINE HUB. Confirm they cannot reach the live venue
  project.
- Put the payment provider into test mode for that remix; give them test card numbers.
- Have a spare bay (or a spare PC) available for the module 09 session.
- Decide now whether module 08 (League/Comps) is in scope for them.

## What to demo live rather than let them read

| Module | Demo |
| --- | --- |
| 01 | The admin hub on a busy day. Nothing explains the product faster. |
| 02 | A good request and a bad request, side by side, in the same session. |
| 05 | A real membership timeline in the payment dashboard, including a failure. |
| 09 | Stand in a bay for a full session start: plug on, launch, welcome window, warnings, shutdown. |
| 11 | Talk through a real past incident from report to fix. |

## Questions to ask them (listen for reasoning, not recall)

- "A client says a customer was charged twice. What do you do first?"
  *Good answer: look at the actual payment records and webhook logs. Bad answer: start reading code
  or start writing a fix.*
- "You need to change the price of peak hours. Where does that live?"
  *Good: settings/config. Bad: 'I'd ask the agent to find where it's hardcoded.'*
- "Why can't you just check `profile.is_admin`?"
- "You've fixed a bug for Client A. Should it go into BASELINE HUB?"
  *Good: only if it's a platform bug, not client-specific, and deliberately.*
- "This campaign says it sent to 940 people out of 1,400. Reaction?"

## Red flags — not ready for a client project

- Guesses a cause and starts fixing before looking at data.
- Says "it should work now" without re-testing.
- Comfortable pasting keys or customer data into chat.
- Accepts whatever the agent produces without reading it.
- Batches six unrelated changes into one request and can't say which broke what.
- Treats the reference docs as optional.
- Cannot explain what RLS is protecting against.

## Green flags

- Reads the reference doc for an area before touching it.
- Asks "who does this affect if it's wrong?" before shipping.
- Reproduces before fixing, verifies after.
- Notices a hardcoded venue value and flags it upward instead of copying it.
- Writes what they learned back into the docs.

## Pacing

Roughly two weeks part-time (see the README table). The two things worth slowing down for are
module 05 (money) and module 10 (the client build practical). Everything else can be compressed if
they're picking it up quickly.

## After sign-off

Their first real client should be one you shadow — you review every change before publish for the
first project, then spot-check on the second.
