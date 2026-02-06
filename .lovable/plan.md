

# Critical Issue: All Email and Notification Functions Are Down

## Root Cause Analysis

I've identified why **no notifications have been sent from Resend or SMS Broadcast today**:

**Multiple critical edge functions are not deployed** (returning 404 errors). Testing the functions directly shows:

| Function | Status | Error |
|----------|--------|-------|
| `send-booking-notification` | 404 NOT FOUND | Not deployed |
| `send-welcome-email` | 404 NOT FOUND | Not deployed |
| `send-password-reset` | 404 NOT FOUND | Not deployed |
| `stripe-webhook` | 404 NOT FOUND | Not deployed |
| `bay-controller-api` | Working | Uses `npm:` imports |
| `charge-booking` | Working | Uses `npm:` imports |

### The Problem: `esm.sh` vs `npm:` Imports

All **broken functions use `esm.sh` imports**:
```typescript
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
```

All **working functions use `npm:` imports**:
```typescript
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
```

The `esm.sh` CDN has been experiencing availability issues that prevent successful function deployment, while `npm:` specifiers are handled natively by Deno and are more reliable.

---

## Impact

This affects ALL customer communications:
- Booking confirmation emails + SMS
- Booking cancellation/reschedule emails + SMS  
- Welcome emails for new signups
- Password reset emails
- Membership activation/cancellation emails
- Payment failed notifications
- Deposit notifications
- Marketing/bulk emails

---

## Implementation Plan

### Phase 1: Fix All Email/Notification Functions (Critical)

Update the import statements in **all 15+ affected edge functions** from `esm.sh` to `npm:`:

**Functions to update:**
1. `send-booking-notification/index.ts`
2. `send-welcome-email/index.ts`
3. `send-password-reset/index.ts`
4. `send-bulk-email/index.ts`
5. `send-deposit-notification/index.ts`
6. `send-league-winner-email/index.ts`
7. `send-marketing-email/index.ts`
8. `send-membership-hold-email/index.ts`
9. `send-payment-failed-email/index.ts`
10. `send-push-notification/index.ts`
11. `stripe-webhook/index.ts`
12. `issue-gift-card/index.ts`
13. `first-session-promo/index.ts`
14. `resend-first-session-emails/index.ts`

**Change pattern:**
```typescript
// FROM (broken):
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

// TO (working):
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "npm:stripe@18.5.0";
```

### Phase 2: Verify Deployment

After code changes:
1. Deploy all updated functions
2. Test each function with a direct API call
3. Confirm 200 responses instead of 404

### Phase 3: Verify Resend API Key (if emails still don't send)

Per the troubleshooting checklist:
1. Confirm the sending domain (`birdiesbayside.com.au`) is verified in Resend dashboard
2. Confirm the API key is scoped to the correct domain
3. Test sending via Resend dashboard directly

---

## Technical Details

### Files to Modify

All files under `supabase/functions/` that contain:
```typescript
import { Resend } from "https://esm.sh/resend@2.0.0";
```
or
```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
```

### Why This Happened

The `esm.sh` CDN acts as a transpilation/bundling service that can:
- Have temporary outages
- Have version resolution issues
- Cache stale module builds

The `npm:` specifier is Deno's native npm compatibility layer, which is more stable for production deployments.

---

## Expected Outcome

After implementation:
- All email functions will be deployed and callable
- Booking confirmations will resume (email + SMS)
- Stripe webhook will process subscription events and send appropriate emails
- Password resets will work
- All transactional communications will be restored

