# Fix the minute-long Hub and booking load

## Confirmed findings

- Lovable Cloud is healthy: database, connection pool, memory, and disk all have ample capacity. Increasing server size would not address this symptom.
- The orange Birdies loader shown in the screenshot is the fallback for lazily downloaded page code in `App.tsx`. It is not controlled by the payment-method request or booking-data requests.
- The current recovery waits eight seconds and then reloads the whole page once. When the page file is merely slow, that reload discards progress and starts the download again, making the delay worse.
- The saved-card lookup completed successfully in about three seconds in the latest live function log. It should not hold the booking page behind the full-screen Birdies loader.

## Changes

1. **Stop the reload loop**
   - Remove the automatic full-page reload from the Birdies loading screen.
   - Keep a clear manual retry only for a genuine page-file failure, so a slow connection is not forced to restart.

2. **Load the essential customer journey with the app**
   - Move the Hub dashboard, booking page, and main website entry page out of on-demand page loading.
   - Keep large, infrequently used admin and specialist pages split into separate downloads.
   - This removes the extra page-file request from the routes customers use to sign in and book.

3. **Make booking data non-blocking and bounded**
   - Let the booking screen render before the saved-card lookup finishes.
   - Add a short request timeout and no automatic retries for the saved-card display lookup; payment is still validated when the customer confirms the booking.
   - Ensure availability loading always clears on request failure, so the bay section cannot spin indefinitely.

4. **Verify the real signed-in flow**
   - Test a fresh signed-in visit to `/booking`, navigation from Hub to booking, and a reload on both desktop and mobile-sized viewports.
   - Record page-file and data-request timings, confirm the full booking controls appear promptly, and confirm a failed optional card lookup does not block selecting a date, time, or bay.

## Technical notes

- Preserve the existing 5-minute cache for the successful saved-card result.
- Do not change pricing, availability, payment, membership, or booking rules.
- Do not resize Lovable Cloud compute; current health metrics do not support that as the cause.
