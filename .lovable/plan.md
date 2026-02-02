

# Automated "First Session Free" Campaign

## Overview

This plan creates an automated system that monitors for new customers who haven't booked yet. When the count reaches 30 eligible users, it automatically gifts them $35 credit and sends a personalized welcome/promotion email.

---

## How It Works

```text
+---------------------------+
|   Daily Check (6am AEST)  |
+---------------------------+
            |
            v
+---------------------------+
|  Count eligible users:    |
|  - No bookings ever       |
|  - Not bulk imported      |
|  - Not opted out          |
|  - Not already gifted     |
+---------------------------+
            |
            v
     [ >= 30 users? ]
        /        \
      No          Yes
       |            |
       v            v
    (wait)      +---------------------------+
                |  For each user:           |
                |  1. Add $35 to balance    |
                |  2. Mark as "promo_sent"  |
                |  3. Send welcome email    |
                +---------------------------+
```

---

## Components to Build

### 1. Database Changes

**Add tracking column to profiles table:**
- `first_session_promo_sent` (timestamp) - Records when the promo was sent so we never double-gift

**Add new email template:**
- Template key: `first_session_promo`
- Subject: "Your Free Hour is Waiting, {first_name}!"
- Content: Gift card-style design with $35 credit emphasis and clear "Book Now" CTA

### 2. New Edge Function: `first-session-promo`

This function will:
1. Query for eligible users (organic signups, no bookings, not opted out, not already sent)
2. If count >= 30: process all eligible users
3. For each user:
   - Update `deposit_balance` by adding $35
   - Set `first_session_promo_sent` timestamp
   - Send personalized email using the branded template

**Eligibility criteria:**
- Has zero bookings (excluding cancelled)
- `marketing_opt_out = false`
- `first_session_promo_sent IS NULL`
- Not part of bulk import (created_at spread check OR explicit flag)
- Account created more than 24 hours ago (give them time to book naturally)

### 3. Cron Schedule

Run daily at **6am Brisbane time** (8pm UTC) to check if threshold is met.

---

## Email Design

The email will follow the branded gift card template style:

**Subject:** "Your Free Hour is Waiting, {first_name}!"

**Design:**
- Green header with Birdies logo
- Cream body with headline: "A Gift From Us To You!"
- Large "$35.00" value display (gift card style)
- Personal message: "We noticed you haven't booked your first session yet..."
- Explanation: Credit has been added to your account
- Prominent "Book Now" button
- Social links and footer

**Template tags supported:**
- `{first_name}`, `{last_name}`, `{email}`

---

## Technical Details

### Edge Function Logic

```text
1. Fetch eligible users:
   SELECT * FROM profiles p
   WHERE p.first_session_promo_sent IS NULL
     AND p.marketing_opt_out = false
     AND p.created_at < NOW() - INTERVAL '24 hours'
     AND NOT EXISTS (
       SELECT 1 FROM bookings b 
       WHERE b.user_id = p.user_id 
         AND b.status != 'cancelled'
     )
   
2. If count >= 30:
   - Process all users in batch
   - For each: update balance, set promo timestamp, send email
   - Log results

3. Return summary: processed count, success/fail counts
```

### Fail-safes

- **Idempotent**: Once `first_session_promo_sent` is set, user is never re-processed
- **Rate limiting**: Emails sent in batches of 50 with 200ms delays
- **Logging**: Full audit trail for debugging

---

## Configuration Options

The function will support optional parameters for manual triggering:

- `force: true` - Process regardless of count threshold
- `threshold: N` - Override the default 30-user threshold
- `dry_run: true` - Preview eligible users without sending

This allows admins to manually trigger campaigns or test the system.

---

## Summary of Changes

| Component | Action |
|-----------|--------|
| `profiles` table | Add `first_session_promo_sent` column |
| `email_templates` table | Add "first_session_promo" template |
| Edge function | Create `first-session-promo` |
| `config.toml` | Register new function |
| Cron job | Schedule daily at 8pm UTC (6am Brisbane) |

---

## Post-Implementation

After this is live, you'll be able to:
1. View eligible user counts in the admin dashboard
2. Manually trigger the campaign early if needed
3. Customize the email template via Admin Settings > Notifications
4. Monitor campaign results via edge function logs

