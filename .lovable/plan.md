
# Fix Watched Customer Alert for Jannie

## Root Cause

The watched customer email list in `supabase/functions/send-booking-notification/index.ts` has the wrong email address for Jannie.

- **Hardcoded in watchlist**: `jannie2909@hotmail.com`
- **Jannie's actual account email**: `jannie2909@gmail.com`

The alert check on line 526 is:
```js
if (notification_type === "confirmation" && watchedEmails.includes(profile.email.toLowerCase())) {
```

Because `jannie2909@gmail.com` does not match `jannie2909@hotmail.com`, the condition is always false for Jannie's bookings and the admin alert is silently skipped. No error is ever thrown -- the function completes successfully, the booking confirmation email and SMS go to Jannie, but the admin alert to `admin@birdiesbayside.com.au` is never sent.

## The Fix

Change one line in the watchlist array from:

```
"jannie2909@hotmail.com",
```

to:

```
"jannie2909@gmail.com",
```

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/send-booking-notification/index.ts` | Fix Jannie's email from `hotmail.com` to `gmail.com` in the `watchedEmails` array |

The fix is one character change. The function will be redeployed automatically.
