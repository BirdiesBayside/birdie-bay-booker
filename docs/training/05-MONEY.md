# 05 — Money: Memberships, Stripe & Credits

Reference: `docs/platform/03-MEMBERSHIPS-BILLING.md` and `docs/platform/12-STRIPE-BILLING-PLAYBOOK.md`

**This is the highest-risk area in the product. Nothing here ships without sign-off.**

## The three ways money moves

1. **Pay-as-you-go bookings** — card charged at checkout.
2. **Memberships** — a monthly subscription in Stripe that unlocks cheaper rates and perks.
3. **Account credit** — a balance on the customer's account (promos, refunds, gift cards, loyalty)
   which is spent before their card is.

## What the customer sees

Tiers with prices and benefits, a signup that charges immediately, a saved card in My Account, a
credit balance, and cheaper booking prices once active.

## What the admin sees

Members list with new/returning/lost tracking, the ability to adjust credit, issue gift cards,
refund bookings, and see each customer's membership timeline.

## What happens behind the scenes

- Stripe holds the subscription and the card. We hold a mirror of the state on the customer's
  profile.
- **Stripe tells us what happened via webhooks**, not the other way round. A subscription only
  becomes active in our database when Stripe's webhook says it is active.
- Credit changes are always written to a ledger table as well as the balance, so every movement
  can be explained later.

## Rules that must not be broken

- **Webhooks are the source of truth.** Never mark a membership active because the checkout page
  loaded successfully.
- **Every webhook handler must be idempotent.** Stripe retries. A customer once got two
  cancellation emails because the same event was processed twice.
- **One active subscription per customer.** Someone once held two tiers at once and was billed for
  both in the same week. Tier changes must modify the existing subscription (prorated, billing
  anchor unchanged), never create a second one.
- **Failed payments follow the ladder, not improvisation:** first failure cancels and refunds
  future bookings, flags the account, forces visitor pricing, and sends a heads-up; second failure
  downgrades to visitor and voids the invoice. A successful payment clears the flag.
- **Never delete the card a live subscription depends on.** Spare cards can go; the primary one is
  guarded, and the subscription's payment method is re-synced after the customer changes it.
- **Never expose service keys or the database password.** They aren't retrievable anyway. Don't
  fabricate placeholders either.

## Common failures

| Symptom | Real cause |
| --- | --- |
| Double charge | Non-idempotent handler or duplicate checkout session |
| Billed for two tiers | New subscription created instead of switching the existing one |
| Duplicate emails on cancel | Same webhook event processed more than once |
| "Card can't be removed" | Blanket delete-block instead of guarding only the primary card |

## Exercise

On your scratch remix in Stripe **test mode**:

1. Sign up for a membership, then switch tiers. Confirm only one subscription exists afterwards.
2. Force a failed payment with a test card and follow the ladder through.
3. Refund a booking and find the matching ledger row.

Then, with the trainer, read one real membership incident end to end and explain the fix.

## Check yourself

- Why is the checkout page loading not proof of payment?
- What does "idempotent" mean here, and what breaks without it?
- What happens on a customer's first failed membership payment, exactly?

→ Next: [06 — Notifications](06-NOTIFICATIONS.md)
