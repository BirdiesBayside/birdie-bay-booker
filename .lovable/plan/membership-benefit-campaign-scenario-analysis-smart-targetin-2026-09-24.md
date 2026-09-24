# Membership Benefit Campaign — Scenario Analysis & Smart Targeting

## The question

Would an automated "you'd save money as a member" campaign cannibalise visitor revenue? Analysis of the last 8 weeks of real booking data says: **only if you send it to the wrong people.**

## Your actual pricing

| Tier | Weekly fee | Per-hour |
|---|---|---|
| Visitor | — | $35–40 |
| Weekday | $15 | $10 |
| Birdie | $27 | $10 |
| Eagle | $35 | $8 |

## Last 8 weeks (real data)

| Segment | Bookers | Hours | Booking revenue |
|---|---|---|---|
| Visitors | 235 | 726 | $23,134 (~$32/hr blended) |
| Birdie members | 33 | 590 | $6,555 + ~$7,128 subs |
| Eagle | 2 | 44 | $352 + subs |
| Weekday | 4 | 19 | $190 + subs |

## The maths (Birdie tier, your most popular)

Break-even for the **customer**: $27/wk + $10/hr beats $35–40/hr at roughly **1 hour per week**.

Break-even for **you** (using your blended visitor yield of ~$32/hr):
a member becomes less profitable than a visitor only above **~1.2 hours/week** (~6+ bookings per 8 weeks) — and only if their play volume stays the same.

## Scenarios per visitor segment (8-week window)

| Visitor type | Count | As visitor | As Birdie member | Verdict |
|---|---|---|---|---|
| 1 booking | 147 | $60 avg | $216 + ~$16 = ~$232 | **Strong gain** (+$170) |
| 2–3 bookings | 61 | ~$120 avg | ~$248–264 | **Gain** (+$130) |
| 4–5 bookings | 16 | ~$200 avg | ~$280–296 | **Gain** (+$85) |
| 6–10 bookings | 7 | ~$240 avg | ~$312–376 | **Gain** (+$90) |
| 11+ bookings (2 whales: $700, $940) | 2 | $1,640 total | ~$1,062 total | **Loss** (−$578 / −$72/wk) |

## Key findings

1. **A blanket campaign to all visitors is roughly revenue-neutral-to-positive, but targeted is clearly better.** 233 of 235 visiting bookers would generate MORE revenue as Birdie members — because most visitors play far less than 1 hr/week, and the $27/wk subscription is pure margin against their low volume.
2. **The only losers are your ~2 heaviest users** (11+ bookings/8wk). Excluding them from the campaign costs you nothing.
3. **Members play 5.6× more often** (2.2 hr/wk vs 0.4 hr/wk). Even at $10/hr, that volume on otherwise-empty off-peak bays is found money, and weekly billing smooths your revenue.
4. **Hidden benefit: members are locked in weekly.** A visitor who stops coming pays $0; a member who stops coming still pays $27/wk until they cancel.
5. **Don't target the harvest-campaign newcomers** (account, no booking): they have no usage pattern, the "you'd save" pitch doesn't apply, and it would clash with the free-credit nurture flow.

## Recommendation: build the campaign, but smart-targeted

Automated email/SMS to visitors where the maths favours you:

- **Trigger:** visitor reaches their **2nd confirmed booking within a rolling 8 weeks** (and is still a visitor).
- **Exclude:** anyone with 6+ bookings in the last 8 weeks (your break-even point — leave them as visitors; they're your most profitable per-hour customers).
- **Also exclude:** current/past members (avoid re-pitching lapsed members with the same generic message) and anyone emailed by this campaign in the last 60 days.
- **Message:** personalised with their real numbers — "You've played X times in the last 8 weeks. As a Birdie member you'd have saved $Y."
- **Delivery:** new edge function `membership-benefit-campaign` on a daily cron, reusing the existing marketing email wrapper and unsubscribe footer.
- **Admin UI:** a campaign card in the **Marketing → Campaigns area, next to the existing "First Session Free" (new customer credit) card** — showing how it works, who qualifies right now (dry-run count), total emails sent, and a "Send test / run now" control, matching how the existing campaign is presented.
- **Template:** editable in Marketing like the First Session Free template (stored in `marketing_templates`), with personalised tags: `{first_name}`, `{booking_count}`, `{hours}`, `{visitor_spend}`, `{member_cost}`, `{savings}`.

## Technical details

- New edge function `supabase/functions/membership-benefit-campaign/index.ts`: daily cron; queries bookings joined to profiles (visitors only, 2–5 bookings in trailing 56 days, no campaign send in 60 days); renders the standard email wrapper; logs each send to a small `membership_campaign_sends` log table (RLS: admin read, service role write) for idempotency and admin visibility.
- Savings figure computed from their actual bookings at current visitor rates vs Birdie ($27/wk + $10/hr).
- No changes to pricing, memberships, the harvest campaign, or any existing flows.

## What I will NOT do

- No changes to visitor or member rates.
- No emailing of zero-booking accounts (stays with the harvest campaign).
- No pitching to your 6+ bookings/8wk heavy visitors.
