# Undo the changes that slowed the Hub down

You were right — this traces to specific changes we made, not to server capacity. Lovable Cloud is healthy (memory 50%, connections 17 of 90, disk 9%), and the booking database queries run in well under a millisecond. The delay is in what the browser has to download and wait for before the page appears.

## What we found, in order of impact

1. **A 5 MB homepage video is preloaded on every single page.**
   `index.html` tells the browser to start downloading the hero video at high priority on every visit — including the booking page, which never shows that video. On a phone connection those 5 MB compete directly with the page code the browser needs to render anything. This preload was added for the homepage and has been growing in cost since.

2. **A "never cache" instruction was added in August.**
   A tag was added to `index.html` to stop old page versions being served. A side effect is that the page shell is re-fetched every visit, and some mobile browsers extend that to the page's code files — so returning visitors re-download everything instead of reusing what they already have. The timing matches "this wasn't an issue before".

3. **The 8-second auto-reload we added last is making slow loads worse.**
   When the page code is merely downloading slowly, the reload throws the partial download away and starts again — turning one slow load into repeated slow loads, which is exactly the "taking longer than expected" loop you saw.

4. **The booking page forces fresh account lookups on every visit.**
   The member/balance lookup was switched to never use its cache, so every visit makes two chained round trips before pricing can show.

5. **Two separate sign-in listeners start at once**, each making its own session call at launch.

## Changes

1. **Remove the sitewide video preload.** Load the hero video only on the homepage, where it is actually shown, and only after the page is interactive. Booking and Hub pages stop downloading 5 MB they never use.
2. **Replace the "never cache" tag** with a correct approach: let the page shell revalidate normally while code files keep their long-lived caching, so returning visitors reuse what they already downloaded instead of refetching it.
3. **Remove the 8-second auto-reload.** Keep a manual "Try again" only, so a slow download is allowed to finish rather than being restarted.
4. **Restore short caching on the account/balance lookup** (fresh after a credit change, cached within a visit), and let the booking screen render before the saved-card lookup returns, with a short timeout on that lookup.
5. **Share one sign-in listener** between the app and notifications instead of two.

## Verification

- Measure the booking page on a throttled mobile-speed connection before and after, recording total bytes downloaded and time until the booking controls are usable.
- Confirm a second visit reuses cached code rather than re-downloading it.
- Confirm the homepage video still plays.
- Confirm signing in, choosing a date/time/bay, and reaching the payment step all work with credit, hour credits, and card.

## Technical notes

- No pricing, availability, payment, membership, or booking rules change.
- No Lovable Cloud compute resize; the health metrics do not support capacity as the cause.
- Files: `index.html`, `src/App.tsx`, `src/hooks/useBooking.ts`, `src/hooks/useAuth.tsx`, `src/hooks/usePushNotifications.ts`, and the homepage hero component.
