# Peak rate $42 + Hour Credits — staged rollout for 21 August

Everything gets built now behind a date switch. Nothing customer-facing changes until **Fri 21 Aug 2026, 00:00 Brisbane**, when the new peak rate and the hour-credit system go live automatically.

## Decisions locked in

- Peak rate goes **$35 → $42**. Off-peak stays $30. Member hourly rates unchanged.
- New **hour-credit balance**, separate from the existing dollar balance. 1 credit = 1 hour of bay time, any tier, peak or off-peak, fully covered, no cash difference either way.
- Gift cards become **hour packs**: 1, 2, 3 or 5 hours at $42 each.
- Existing dollar balances are untouched and keep working exactly as they do today.

## 1. Date-switched pricing

- Add an effective-from date to the pricing config so both the $35 and $42 peak rates exist side by side.
- Every place that prices a booking asks for "the rate on this booking's date", so a booking made in August for a September session is already priced at $42. This is the correct behaviour — the session date decides the price, not the day it was booked.
- Admin Settings gets a small "Upcoming price change" note showing the scheduled rate and date, with the ability to change or cancel it before it lands.

## 2. Hour credits

A new credit wallet on each customer, with its own ledger (who granted it, why, which booking spent it) mirroring the dollar ledger we already have.

Credits can be granted by: gift card redemption, the first-session promo, admin manual grant, and booking refunds where the booking was paid with credits.

**Booking flow** — when a customer has hour credits, the payment step shows:

- **Use credits** — spends 1 credit per booked hour, $0 charged.
- **Take an hour off** — spends 1 credit, the rest of the booking is charged normally (card or dollar balance).
- Pay normally and keep the credits.

Partial hours (30 min bookings) round to the nearest half credit. Credits are checked against the database at the moment of payment, same just-in-time check we added for dollar balances.

**My Account** shows the hour-credit balance and history alongside the dollar balance.

## 3. First Session Free promo

Switches from a $35 dollar credit to **1 hour credit**. The promo email copy changes from "$35 credit" to "1 free hour". Both versions are wired up now; the switch flips on 1 September so anyone who receives the email in August still gets the $35 they were promised.

## 4. Gift cards

- Public gift card page changes to hour packs (1 / 2 / 3 / 5 hours), priced at $42 per hour, with the dollar value shown for clarity.
- Redemption grants hour credits instead of dollars.
- Admin-issued gift cards get an hours option too, keeping the dollar option for goodwill/refund cases.
- **All gift cards already issued keep their dollar value and remain redeemable** — no one loses anything.

## 5. POS products

Peak line items are repriced on the switch date: 1 Hr Peak $42, 2 Hr $84, 3 Hr $126, 4 Hr $168. Off-peak unchanged. Staff also get "1 Hr Credit" and hour-pack items so credits can be sold at the counter.

## 6. Stripe

- New Stripe prices for the $42 hour and the hour packs. Old prices stay in place until the switch, then get archived.
- Memberships and subscriptions are untouched — no change to any recurring billing.

## 7. Emails, site copy and comms

- Everywhere "$35" appears (booking confirmations, marketing templates, website pricing, Hub pricing screens, membership sell copy) gets updated with date-switched copy where it's dynamic, and a coordinated content update for the static pages.
- Optional: a heads-up email to the customer base in mid-August announcing the change from 1 September. Say the word and I'll draft it.

## Rollout timeline

| When | What happens |
|---|---|
| Now | Build everything. Hour credits live but unfunded. Peak stays $35. |
| Now → 31 Aug | Internal testing: grant yourself credits, book with them, buy a test hour pack. |
| Optional, mid-Aug | Announcement email to customers. |
| **1 Sep 00:00 Brisbane** | Peak $42, POS repriced, gift cards become hour packs, promo becomes 1 hour. Automatic — no manual step. |
| 1 Sep onward | Old dollar gift cards and dollar balances continue to work indefinitely. |

The switch runs off a single stored date. If you want to move it, delay it, or pull the trigger early, it's one field in Admin Settings.

## Technical notes

- `pricing_config` gains `effective_from`; `calculateHourlyRate` in `src/lib/pricing-utils.ts` takes the booking date and selects the active row. `VISITOR_PEAK_RATE` becomes a lookup rather than a constant. Hardcoded `35` in `src/pages/Booking.tsx` (multi-bay peak restriction) and `first-session-promo` read the same source.
- New `profiles.hour_credit_balance` (numeric) plus `hour_credit_transactions` table, RLS + GRANTs mirroring `deposit_transactions` (user reads own, admin manages, service_role all).
- Credit spend happens server-side in `charge-booking` so the balance can't be manipulated client-side; `cancel-booking`, `refund-booking`, `reschedule-booking` and `extend-booking` all get credit-aware paths.
- `create-gift-checkout` takes `hours` instead of a free-form amount; `redeem-gift-card` / `redeem-gift-card-by-code` / `issue-gift-card` branch on gift card type (`dollars` vs `hours`) with a new `credit_hours` column on `gift_cards`.
- POS reprice and Stripe price archival run as a one-shot scheduled job on 1 Sep (pg_cron → edge function), guarded so it can only apply once.
