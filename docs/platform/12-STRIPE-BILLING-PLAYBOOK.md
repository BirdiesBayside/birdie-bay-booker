# 12 — Stripe Billing Playbook (portable)

Paste-ready billing rules for any new client project. This is **logic, not data** — no
Birdies price IDs, tiers or amounts. Everything here was learned the hard way in
production; re-deriving it costs real money in duplicate charges and refunds.

---

## 1. Ground rules

- API version: pin one version in every function. Current: `2025-08-27.basil`.
  Never mix versions across functions.
- Webhooks run with `verify_jwt = false` in `supabase/config.toml`. Every other
  function requires the user JWT.
- Edge functions use `npm:` imports, native `Deno.serve`, and full CORS headers.
- `STRIPE_SECRET_KEY` lives in secrets, never in code. Publishable key may be inline.
- **Price IDs live in source code as string constants** (or in a `membership_tiers`
  table), never created on the fly with `price_data`. Ad-hoc prices make revenue
  reporting and tier detection impossible.
- Amounts are always integer cents.

### Tier mapping constant

```ts
// One product + one price per tier. Keep both IDs — price for checkout,
// product for identifying an existing subscription.
export const TIERS = {
  tier_a: { price_id: "price_...", product_id: "prod_...", rank: 1 },
  tier_b: { price_id: "price_...", product_id: "prod_...", rank: 2 },
} as const;
```

`rank` is what makes upgrade/downgrade decisions and feature gating possible.
Never infer tier from the price *amount*.

---

## 2. Customer identity

One Stripe customer per app user, resolved **by email**:

```ts
const customers = await stripe.customers.list({ email: user.email, limit: 1 });
const customerId = customers.data[0]?.id;
```

- If none exists, pass `customer_email` to Checkout and let Stripe create it.
- Never create a customer eagerly on signup — you end up with orphans.
- Store `stripe_customer_id` on the profile once known, but always treat email as
  the source of truth for recovery, because customers get created by Checkout too.

---

## 3. Subscription creation vs switching — the single most important rule

> **A user may have at most one active subscription. Ever.**

Two tiers billing the same person in the same week is the failure mode that cost us
real refunds. The cause: creating a new Checkout session for a user who already had
an active subscription.

`create-membership-checkout` must branch:

```ts
const existing = await stripe.subscriptions.list({
  customer: customerId, status: "active", limit: 1,
});

if (existing.data.length > 0) {
  // SWITCH — do NOT create a checkout session
  const sub = existing.data[0];
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: sub.items.data[0].id, price: NEW_PRICE_ID }],
    proration_behavior: "create_prorations",
    billing_cycle_anchor: "unchanged",
    payment_behavior: "error_if_incomplete",
  });
  return { switched: true };
}

// NEW — checkout session, mode: "subscription"
```

Why each flag matters:

| Flag | Why |
| --- | --- |
| `proration_behavior: "create_prorations"` | Upgrades charge the difference; downgrades credit it. Fair both ways. |
| `billing_cycle_anchor: "unchanged"` | Keeps their renewal date. Omitting it resets the cycle and re-charges a full month immediately. |
| `payment_behavior: "error_if_incomplete"` | Fails loudly instead of silently leaving an `incomplete` subscription. |

**Never** implement switching as cancel-then-create. It double-charges, resets the
billing date, and loses the subscription history.

Also cancel any lingering `incomplete` / `past_due` subscriptions for that customer
before creating a new one, or Stripe will happily run two.

---

## 4. Idempotency (three layers, all required)

### 4a. Checkout session keys
Use a deterministic key plus a random suffix so a genuine retry after failure is
allowed but a double-click is not:

```ts
idempotencyKey: `checkout:${user.id}:${priceId}:${crypto.randomUUID()}`
```

Pair it with an application-level guard: refuse to create a session if one for the
same user+price was created in the last 60 seconds.

### 4b. Webhook event dedupe
Stripe retries. Without a guard, one `invoice.payment_failed` sends two emails and
runs the downgrade twice.

```sql
create table public.stripe_processed_events (
  id text primary key,               -- Stripe event id, evt_...
  type text not null,
  processed_at timestamptz not null default now()
);
grant all on public.stripe_processed_events to service_role;
alter table public.stripe_processed_events enable row level security;
-- no policies: service_role only
```

First statement in the webhook, after signature verification:

```ts
const { error } = await supabase
  .from("stripe_processed_events")
  .insert({ id: event.id, type: event.type });
if (error?.code === "23505") return new Response("ok"); // already handled
```

Insert *before* doing the work, not after.

### 4c. Nested subscription IDs
Stripe moved the subscription reference on invoices. Always read defensively:

```ts
const subId = invoice.subscription
  ?? invoice.parent?.subscription_details?.subscription
  ?? invoice.lines?.data?.[0]?.parent?.subscription_item_details?.subscription;
```

---

## 5. Failed payments — the ladder

Do **not** cut someone off on the first decline. Cards fail for boring reasons.

**First failure** (`invoice.payment_failed`):
1. Stamp `profiles.payment_failed_at = now()`.
2. Force the user to the lowest/visitor pricing tier — they can still use the
   product, they just pay non-member rates.
3. Cancel and refund any *future* bookings that were priced at member rates.
4. Send a friendly heads-up email with a self-serve retry link.
5. Keep the subscription alive.

**Second failure:**
1. Downgrade the tier for real (`profiles.membership_tier = 'visitor'`).
2. Void the failed invoice so Stripe stops retrying and the user cannot pay an
   invoice for a membership they no longer hold.
3. Send the downgrade notice.

**Recovery** (`invoice.payment_succeeded` or `customer.subscription.updated` →
`active`): clear `payment_failed_at`, restore the tier, restore member pricing.
Recovery must be automatic — never require staff action.

Self-serve retry: a dialog that fetches the open invoice's
`hosted_invoice_url`, or creates a SetupIntent to replace the card then retries
the invoice. Keep the friction near zero.

---

## 6. Activation — only trust the webhook

```
checkout.session.completed  →  record intent, do NOT grant access
customer.subscription.updated/created with status "active"  →  grant the tier
```

A completed Checkout session is not a paid subscription. Granting on redirect
back to the success URL means bank declines and 3DS abandonment hand out free
memberships. The success page should poll a `check-subscription` function, not
assume.

Also: no free trial coupons unless the client explicitly asks. Charge immediately
on signup. Trials triple the failure surface for very little conversion gain.

---

## 7. Reading subscription state

`check-subscription` is the single source of truth for the frontend. Call it on
login, on app load, after returning from Checkout, and on a slow interval.

Return the minimum:

```json
{ "subscribed": true, "product_id": "prod_...", "subscription_end": "2026-09-01T00:00:00Z" }
```

Frontend maps `product_id` → tier via the `TIERS` constant. Never send the price
amount to the client for gating decisions.

Cache it in global auth state; every price shown in the UI reads from it.

---

## 8. Unlocking pricing by tier

Two separate concerns; keep them separate.

**Entitlement** — what the tier *is*. Derived from Stripe, refreshed by
`check-subscription`, stored on the profile as `membership_tier`.

**Price resolution** — what a given booking costs. A pure function, server-side
authoritative:

```ts
function resolvePrice({ tier, isPeak, durationMins, paymentFailed }) {
  const effectiveTier = paymentFailed ? "visitor" : tier;
  const rate = RATES[effectiveTier][isPeak ? "peak" : "offpeak"];
  return Math.round(rate * (durationMins / 60));
}
```

Rules that keep this sane:
- Rates live in a `membership_tiers` / pricing table editable from Admin, never
  hardcoded in components. Different venues have different numbers.
- The client may *display* a price; the server must *recompute* it before charging.
  Never trust a price sent from the browser.
- `payment_failed_at` always demotes to the base tier at price time. This is why
  step 5 works without touching the subscription.
- Feature gating (not just price) uses `rank >= required_rank`, so adding a tier
  in the middle doesn't require touching every check.

---

## 9. Refunds

- Duplicate charges: refund automatically with `reason: "duplicate"`. Don't wait
  for the customer to notice.
- Deleted/cancelled bookings inside the refund window: automatic refund, logged.
- Live sessions (past the start cut-off): no refund, blocked at the API, not just
  in the UI.
- Every refund writes an audit row. Reconciliation without an audit trail is
  guesswork.

---

## 10. Acceptance test before taking a real payment

Run this end to end in test mode on every new project:

1. Create **one** tier (product + price) from scratch.
2. New user subscribes → tier granted only after the `active` webhook.
3. Create a second tier, switch → charged a prorated difference, **renewal date
   unchanged**, exactly one active subscription in Stripe.
4. Force a decline (`4000 0000 0000 0341`) → base pricing applied, heads-up email
   sent once, subscription still alive.
5. Fix the card → tier and pricing restore automatically with no staff action.
6. Replay any webhook event → no duplicate side effects.

If step 3 resets the renewal date or leaves two subscriptions, stop and fix it
before going live. That's the expensive one.

---

## 11. Zero-catalogue state

A fresh project has no products. Membership UI must render empty states, not
crash. Do **not** seed a placeholder tier to avoid a null — that placeholder will
eventually get sold to someone.
