## Refunds for Martin — final state you want

Keep: $10 Bay 1 booking + active **Birdie** subscription ($27/wk, next bill $27).
Refund: everything else.

### Refunds to issue


| #   | Charge                                  | Amount                                               | Action                                                                                   |
| --- | --------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | `ch_3Tu9x2…` — orphan $35               | $35                                                  | Already auto-refunded by Stripe. Verify, no action.                                      |
| 2   | `ch_3Tu9y7…` — Eagle sub first invoice  | **Refund $35.00**                                    | `reason=duplicate` (bug, not customer)                                                   |
| 3   | `ch_3TuA31…` — accidental Bay 2 booking | **Refund $35.00** + cancel booking `ae740e88…`       | `reason=duplicate`                                                                       |
| 4   | Birdie sub first invoice (goodwill)     | **Refund $27.00** (or full amount if it was charged) | `reason=requested_by_customer`                                                           |
| 5   | Stripe customer balance                 | **Reset to $0**                                      | So the ~$8 Eagle→Birdie proration credit doesn't silently offset next week's $27 invoice |


**Ordering note:** I'll run `stripe_api_read` on `cus_UtxK9YsjGaTWqy` first to confirm (a) the exact amount of the Birdie first invoice, (b) the current customer_balance, so refund #4 uses the real number and #5 zeroes correctly. Next Birdie invoice must land as a clean $27 charge next week.

**Verification after:**

- `bookings`: only `34ccfff9` (Bay 1 $10) remains confirmed; `ae740e88` = cancelled.
- Stripe subs: only the Birdie `sub_1TuA0X…` active.
- Stripe customer balance = 0.
- Upcoming invoice on the sub = $27.00.

### One goodwill email

I will email him personally, do not send any emails to Martin 

---

## Preventing the double-fire — backend only, zero UI change

You're right that the button is already disabled during submit — that's not where the leak is. The bug is in two backend places, and both fixes are invisible to the customer.

### Fix A — Membership checkout: stable idempotency key

`create-membership-checkout` currently appends `crypto.randomUUID().slice(0,8)` to the idempotency key, which means every retry (double-tap, network hiccup, tier switch) is a *new* Stripe request → new PaymentIntent → duplicate charge like Charge A.
Change: derive the key from `user_id + tierKey + priceId + floor(now / 60_000)` (per-minute bucket). Retries inside 60s hit the same Stripe slot and Stripe returns the original response instead of charging again. Retries after 60s (i.e. genuine second attempt) still work.

### Fix B — Booking: server-side "recent duplicate" guard

`charge-booking` will reject if the same `user_id` already has a booking created in the last **90 seconds** with an overlapping time window. Returns a soft error the client already handles ("This slot was just booked — check My Bookings"). This is the exact case that produced Charge E: two POSTs 46 seconds apart, both went through. Problem is, sometimes people genuinely want to book two bays?

### Fix C — Membership tier-switch refund policy

When `create-membership-checkout` cancels an existing sub to switch tier and the cancelled sub was created **less than 10 minutes ago**, refund its most recent paid invoice to the card (instead of leaving a Stripe credit balance). This is what would have prevented today's Eagle→Birdie mess without any manual intervention.

None of the above touches the UI. No spinners, no confirm dialogs, no extra clicks. All three are pure server-side hardening.

---

## What I need from you

1. **Approve the refunds + booking cancellation.** I'll confirm the exact Birdie invoice amount from Stripe first, then execute.
2. **Yes/no on the goodwill email.**
3. **Approve fixes A, B, C** so I ship them in the same build turn.

Say "go" and I do all of it.