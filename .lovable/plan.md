## What I found

- Aayden and Tom’s bookings were paid and marked confirmed, but the confirmation notification path did not run reliably.
- This affects the no-card / first-card Stripe Checkout flow, where the browser returns to the success page and the payment webhook may race each other.
- The success-page verifier has a bug: if the booking is already confirmed, it returns success without sending a confirmation.
- The same verifier also triggers the notification without waiting for it to finish, so the function can end before email/SMS are actually sent.
- Current logs show no successful `send-booking-notification` run for those booking IDs, which matches the customer reports.

## Fix plan

1. Make booking confirmation notifications idempotent
   - Track each booking confirmation send in a backend notification ledger.
   - Only one process can claim a confirmation send at a time.
   - If it already sent, skip duplicates.
   - If a previous attempt failed or got stuck, allow a retry.

2. Fix the success-page payment verifier
   - When it finds a booking already confirmed, it will still call the notification sender.
   - Replace the unawaited background call with an awaited call.
   - Surface notification send failures in logs instead of silently swallowing them.

3. Harden the Stripe webhook
   - Confirm the booking as it does now.
   - Call the same idempotent notification sender.
   - Check the notification function response and log the real error body if it fails.

4. Backfill the two affected bookings
   - Re-send confirmation email/SMS for Aayden Dodd and Tom Scallon using the normal booking confirmation function.
   - Because the new ledger is idempotent, this can be done safely.

5. Validate
   - Deploy the updated functions.
   - Trigger/check the notification function for both affected booking IDs.
   - Confirm the notification ledger shows the confirmations as sent.

## Technical notes

- I already added the notification ledger table and backend helper functions needed for idempotency.
- The remaining work is wiring `send-booking-notification`, `verify-booking-payment`, and `stripe-webhook` to use it.