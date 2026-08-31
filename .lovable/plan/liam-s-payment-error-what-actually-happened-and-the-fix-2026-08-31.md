# Liam's "payment error" — what actually happened, and the fix

## The situation (verified)

Liam **does** have a card on file: a Visa debit ending 8913 added via Apple Pay. So it isn't a
"no card" problem, and the app was right not to prompt him to add one.

What actually happened this morning (Brisbane time): he tried to book Bay 3 for Mon 1 Sep, 10:00
(1hr). His $9 credit was applied automatically, leaving $21 to charge to the card. The card was
declined by his bank twice, 60 seconds apart, with decline code `do_not_honor` ("Your card was
declined", issuer-side, advice: try again later). This is a bank decline, not a Stripe or app
failure — likely because it's an Apple Pay debit card being charged off-session (no device
authentication), which some AU issuers refuse.

His $9 credit was correctly restored — his balance is still $9 and no booking was created or
charged.

## The real bug: the error message

The backend returns a clear, friendly message ("Your card was declined. Please try a different
card."), but the front end throws away that message. `supabase.functions.invoke` reports any
non-2xx as the generic string `Edge Function returned a non-2xx status code`, and the booking code
uses that raw message in the toast. So every payment decline — declined card, expired card,
insufficient funds — looks like a cryptic system error to the customer.

## What to change

1. **Surface the real error text.** Add a small helper that reads the error body from a
   `FunctionsHttpError` (`await error.context.text()` / `.json()`) and returns the backend's
   `error` field. Use it everywhere a booking-related function is invoked:
   - `src/hooks/useBooking.ts` (charge path)
   - `src/pages/Booking.tsx` (`completePendingBooking`)
   - extend / reschedule dialogs, which have the same pattern.
2. **Make declines actionable.** When the returned code is a card error
   (`card_declined`, `expired_card`, `insufficient_funds`, `authentication_required`), show a
   "Payment declined" dialog with the bank's reason plus a **Update / add another card** button
   that opens the existing Stripe card-setup flow — instead of a red toast that dead-ends.
3. **Retry on-session for wallet cards.** Off-session charging of Apple Pay-sourced cards is the
   most common cause of `do_not_honor` and `authentication_required`. When an off-session charge
   fails with a card error, fall back to a Stripe Checkout session for that booking (the same
   `requiresCheckout` path already used for customers with no card) so the customer can authorise
   the payment live. This would have let Liam complete his booking.

## Immediate action for Liam

Nothing is owing and his $9 credit is intact. Tell him his bank declined the card ("do not
honour") and he should either try a different card in the app or re-add the card directly (not via
Apple Pay), then rebook. Staff can also take the booking manually and charge in-house.

## Technical notes

- No database or pricing changes; `pricing_config` and the balance ledger both behaved correctly.
- Fallback-to-Checkout must reuse the existing pending-booking/cleanup logic in
  `completePendingBooking` so a failed decline never leaves an orphan pending row.
