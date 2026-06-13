# Hub-Native Gift Card System

Replace the Shopify gift card flow with a self-hosted gift card purchase page on the Hub, paid via existing Stripe checkout, with tailored delivery emails (recipient direct, or printable to sender).

## 1. Public Purchase Page

New route: `hub.birdiesbayside.com.au/gift` (anonymous, no login required).

Form fields:
- **Amount** — preset chips ($35, $70, $105, $175, $350) + custom amount
- **Recipient name**
- **Recipient email**
- **Sender name** (pre-filled if logged in)
- **Sender email** (for receipt + printable copy)
- **Personal message** (optional, 280 chars)
- **Delivery date** — defaults today; date picker for future
- **Delivery method** — radio:
  - "Email to recipient" (default)
  - "Email to me to print & give in person"
  - "Both"

Branded design matching Hub (cream/green/orange, Anton headings).

Shopify side: replace the gift card product/page with a simple Shopify page that links to `https://hub.birdiesbayside.com.au/gift` (or `<iframe>` embed if preferred).

## 2. Payment Flow

New edge function: `create-gift-checkout`
- Validates input (Zod)
- Generates short redemption code (e.g. `BIRDIE-X7K2-9QPL`)
- Inserts row in `gift_cards` with `status='pending_payment'`, `source='web'`, plus new columns: `delivery_method`, `redemption_code`, `stripe_session_id`
- Creates Stripe Checkout Session (`mode: payment`, dynamic price_data so any amount works)
- Returns checkout URL

Stripe webhook (`stripe-webhook`) — add handler for `checkout.session.completed` where `metadata.purpose === 'gift_card'`:
- Mark gift_card `status='scheduled'` if `scheduled_for > today`, else `status='pending'`
- If `scheduled_for <= today`, invoke `issue-gift-card` immediately
- Also send sender receipt with redemption code

Daily cron (`process-scheduled-gift-cards`) — already exists; will continue to handle future-dated sends.

## 3. Tailored Email Delivery

Update `issue-gift-card` to branch on `delivery_method` and recipient account status:

| Scenario | Email goes to | Template variant |
|---|---|---|
| Recipient has Hub account, method=email_recipient | Recipient | **"You've been gifted by {sender_name}"** — credit auto-applied, CTA "View Credit in Hub" |
| Recipient has NO account, method=email_recipient | Recipient | **"{sender_name} sent you a gift"** — CTA "Create Account to Redeem" |
| method=print_to_sender | Sender | **Printable gift card** — decorated HTML card with recipient name, amount, message, redemption code |
| method=both | Recipient + Sender | Both above |

When recipient already has an account → the existing `auto_redeem_gift_cards` trigger has already added credit during account creation OR we manually apply it now (new path: if `recipient_email` matches a profile, credit immediately + send "You've been gifted" email).

Add new helper: `apply_gift_card_to_existing_user(gift_card_id)` — credits balance, marks redeemed, logs `deposit_transactions`, sends personalised email naming the sender.

## 4. Schema Changes

```sql
ALTER TABLE gift_cards
  ADD COLUMN delivery_method text DEFAULT 'email_recipient'
    CHECK (delivery_method IN ('email_recipient','print_to_sender','both')),
  ADD COLUMN redemption_code text UNIQUE,
  ADD COLUMN stripe_session_id text,
  ADD COLUMN paid_at timestamptz;

CREATE INDEX idx_gift_cards_redemption_code ON gift_cards(redemption_code);
```

Update `source` enum/check to include `'web'`.

## 5. Manual Redemption (for printed cards)

Add small "Redeem a Gift Card" section in Hub `My Account`:
- Input: redemption code
- Calls new edge function `redeem-gift-card-by-code` → credits balance, marks redeemed, logs transaction
- Works even if buyer didn't know recipient's email

## 6. Cleanup

After confirming the new flow works end-to-end:
- Delete `supabase/functions/shopify-gift-card-webhook/`
- Delete `SHOPIFY_WEBHOOK_SECRET` (only used by gift cards)
- Keep `shopify_*` columns on `gift_cards` for historical traceability (only 0 historical rows anyway, but harmless)
- Delete the Liquid section file & remove the Shopify product
- Remove the Shopify-side webhook config

## 7. Admin Visibility

`GiftCardsSection.tsx` — add filter chip for `source: web` and surface `delivery_method` + `redemption_code` in the row detail so staff can look up printed-card codes if customers call.

## Technical Notes

- Stripe Checkout uses dynamic `price_data` (no Stripe product/price needed; mirrors deposit top-up pattern)
- Idempotency key on `create-gift-checkout` = random UUID per attempt (matches existing checkout retry strategy)
- All dates use Australia/Brisbane timezone for `scheduled_for` comparisons
- Redemption code: 12 chars, uppercase, hyphenated, alphabet excludes ambiguous chars (0/O, 1/I)
- Printable email styled as a card (cream background, orange amount, Anton heading) — looks good when printed on A4

## Out of Scope (for now)

- PDF download (HTML print is fine per your call)
- Custom card designs / images
- Bulk corporate gift card purchases
- Refunds via UI (handle in Stripe dashboard manually if needed)
