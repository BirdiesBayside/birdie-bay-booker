

# 24-Hour Grace Period with Safe Card-Update Retry

## Overview

This plan implements a payment failure recovery system that:
1. Gives members 24 hours to update their card before downgrading
2. Only retries payment when the card is updated AND there's an outstanding invoice
3. Prevents accidental charges to fully paid-up members who innocently update their card

---

## The Key Safety Check

When someone updates their card, we need to check:

```text
Does this customer have an unpaid/open invoice?
├── YES → Retry the payment immediately
└── NO  → Just sync the card to their subscription (no charge)
```

This is done by checking Stripe for open invoices with `status: "open"` before attempting any retry.

---

## Implementation Components

### 1. Database: Add Grace Period Tracking

Add a new column to the `profiles` table:

```sql
ALTER TABLE profiles 
ADD COLUMN payment_failed_at TIMESTAMPTZ DEFAULT NULL;
```

This tracks when the 24-hour clock starts.

---

### 2. Modify `stripe-webhook/index.ts` - Grace Period Instead of Immediate Downgrade

**Current behavior (lines 131-228 and 537-677):**
- When `past_due`, `unpaid`, or `invoice.payment_failed` → Immediately cancel subscription, delete ALL cards, reset to visitor

**New behavior:**

```text
When invoice.payment_failed (first failure):
├── Check if payment_failed_at is already set
│   └── If not set → Set to now()
├── Send "payment failed" email with:
│   ├── Clear 24-hour deadline messaging
│   └── Link to Hub account page: https://hub.birdiesbayside.com.au/account
├── Keep subscription active (don't cancel yet)
└── Keep all payment methods intact (don't detach)
```

**Remove these aggressive behaviors:**
- Lines 163-178: Bulk detachment of all payment methods
- Lines 159-161: Immediate subscription cancellation
- Lines 597-610: Payment method detachment in `invoice.payment_failed`

---

### 3. Modify `sync-subscription-payment-method/index.ts` - Add Safe Retry Logic

This function is called from the Hub when a user updates their card. We'll enhance it to:

1. Check if the customer has any open (unpaid) invoices
2. If yes → Attempt to pay the open invoice with the new card
3. If no → Just sync the card (existing behavior)

```typescript
// Check for open invoices that need payment
const openInvoices = await stripe.invoices.list({
  customer: customerId,
  status: "open",
  limit: 1,
});

if (openInvoices.data.length > 0) {
  const invoice = openInvoices.data[0];
  logStep("Found open invoice, attempting payment", { invoiceId: invoice.id });
  
  try {
    // Pay the invoice with the new payment method
    await stripe.invoices.pay(invoice.id, {
      payment_method: latestPaymentMethod.id,
    });
    logStep("Successfully paid outstanding invoice");
    
    // Clear the grace period flag in the database
    // (webhook will handle tier restoration when subscription becomes active)
  } catch (payError) {
    logStep("Failed to pay invoice with new card", { error: payError });
    // Card still didn't work - they'll need to try again
  }
} else {
  logStep("No open invoices - just syncing card for future payments");
}
```

**Key safety**: The `stripe.invoices.list({ status: "open" })` query ensures we only attempt payment when there's actually money owed.

---

### 4. Create `process-payment-grace-period/index.ts` - Hourly Enforcement

A scheduled edge function that enforces the 24-hour deadline:

```text
Runs every hour via pg_cron

1. Find profiles where:
   - payment_failed_at IS NOT NULL
   - payment_failed_at < NOW() - INTERVAL '24 hours'

2. For each overdue profile:
   ├── Get their Stripe subscription
   ├── Check if subscription is now active (they fixed it)
   │   └── If active → Clear payment_failed_at, done
   ├── If still past_due/unpaid:
   │   ├── Cancel subscription in Stripe
   │   ├── Reset membership_tier to 'visitor'
   │   ├── Clear payment_failed_at
   │   └── Send "membership cancelled" email
```

---

### 5. Clear Grace Period on Successful Payment

In `stripe-webhook/index.ts`, when `invoice.payment_succeeded` fires for a subscription:

```typescript
// Clear any payment_failed_at flag (they've recovered)
await supabaseAdmin
  .from("profiles")
  .update({ payment_failed_at: null })
  .eq("email", email);
```

---

### 6. Update Payment Failed Email Template

Enhance the email to include:

- **Clear 24-hour deadline**: "Please update your payment method within 24 hours"
- **Direct Hub link**: Button/link to `https://hub.birdiesbayside.com.au/account`
- **Urgency messaging**: Explain that membership will be cancelled if not resolved

Template tags to support:
- `{hub_account_url}` → `https://hub.birdiesbayside.com.au/account`
- `{deadline_hours}` → `24`

---

## Customer Experience Flows

### Flow A: Payment Fails, Customer Updates Card Within 24 Hours

```text
Day 1, 9:00 AM - Weekly payment fails
├── payment_failed_at = 9:00 AM
├── Email sent: "Update within 24 hours"
└── Membership stays active

Day 1, 2:00 PM - Customer goes to Hub → Account → Adds new card
├── sync-subscription-payment-method runs
├── Checks: Open invoice exists? YES
├── Attempts stripe.invoices.pay()
├── SUCCESS → Invoice paid
├── Webhook: invoice.payment_succeeded
│   └── Clears payment_failed_at
└── Customer retains membership seamlessly
```

### Flow B: Fully Paid Member Updates Card

```text
Customer is fully paid up, next payment in 5 days
├── Goes to Hub → Account → Updates card
├── sync-subscription-payment-method runs
├── Checks: Open invoice exists? NO
├── Just syncs card to subscription
└── NO charge attempted - customer not surprised
```

### Flow C: Payment Fails, Customer Doesn't Fix Within 24 Hours

```text
Day 1, 9:00 AM - Weekly payment fails
├── payment_failed_at = 9:00 AM
├── Email sent: "Update within 24 hours"
└── Membership stays active

Day 2, 10:00 AM - Hourly cron runs
├── Finds profile with payment_failed_at older than 24h
├── Checks Stripe: Still unpaid
├── Cancels subscription
├── Resets tier to 'visitor'
├── Clears payment_failed_at
└── Sends "membership cancelled" email
```

---

## Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| Database migration | Create | Add `payment_failed_at` column |
| `stripe-webhook/index.ts` | Modify | Set grace period, remove bulk card deletion, clear flag on success |
| `sync-subscription-payment-method/index.ts` | Modify | Add open invoice check + retry logic |
| `process-payment-grace-period/index.ts` | Create | Hourly cron to enforce 24-hour deadline |
| `supabase/config.toml` | Modify | Add config for new edge function |
| Email template (via DB) | Update | Add 24-hour messaging and Hub link |
| SQL (pg_cron) | Create | Schedule hourly enforcement job |

---

## Summary of Card Handling Rules

| Scenario | Action | Cards Kept? |
|----------|--------|-------------|
| Payment fails (first attempt) | Set grace period, send email | Yes |
| Customer updates card + has unpaid invoice | Retry payment immediately | Yes |
| Customer updates card + no unpaid invoice | Just sync card | Yes |
| 24 hours pass without payment | Cancel subscription, reset to visitor | Yes |
| Booking fails with `expired_card` | Remove that specific expired card | No (just that card) |
| Booking fails with `insufficient_funds` | Show error, keep card | Yes |

---

## Technical Notes

- **Stripe's `invoice.pay()`**: Accepts a payment method ID and attempts immediate payment
- **Open invoice check**: `stripe.invoices.list({ status: "open" })` returns invoices awaiting payment
- **Idempotency**: Setting `payment_failed_at` only if null prevents resetting the 24-hour clock on retries
- **Card retention**: Cards are never bulk-deleted; only genuinely expired cards are removed during booking attempts

