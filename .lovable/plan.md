

## Plan: Scheduled Admin Reminder Emails for Winner Confirmations

### What We're Building
Two scheduled edge functions that email `admin@birdiesbayside.com.au` as reminders:
1. **Weekly** — Every Monday at 9:00 AM Brisbane time (Sunday 23:00 UTC) to confirm the weekly league winner
2. **Monthly** — 1st of each month at 9:00 AM Brisbane time to confirm the previous month's monthly winner

### Implementation

#### 1. Create edge function: `send-winner-reminder`
A single edge function that accepts a `type` parameter (`weekly` or `monthly`) and sends a branded reminder email via Resend to `admin@birdiesbayside.com.au`.

- **Weekly**: Queries `sgt_tournaments` or recent tournament data to include context (e.g. which tournament just ended). Subject: "Reminder: Confirm This Week's League Winner"
- **Monthly**: Includes the previous month name. Subject: "Reminder: Confirm [Month]'s Monthly League Winner"
- Uses existing Birdies email branding (green header, cream body, orange CTA button linking to the admin SGT Manager page)

#### 2. Add `verify_jwt = false` to `supabase/config.toml`
```toml
[functions.send-winner-reminder]
verify_jwt = false
```

#### 3. Schedule two cron jobs via `pg_cron` + `pg_net`
- **Weekly**: `0 23 * * 0` (Sunday 23:00 UTC = Monday 9:00 AM AEST)
- **Monthly**: `0 23 L * *` → use `0 23 1 * *` offset by one day. Since we want 1st of each month at 9am BNE (UTC+10), that's `0 23 28-31 * *` — actually simpler: schedule `0 23 * * *` daily but the function checks if it's the 1st. Better approach: two separate cron entries:
  - Weekly: `'0 23 * * 0'` with body `{"type":"weekly"}`
  - Monthly: `'0 23 1 * *'` with body `{"type":"monthly"}` — this fires on the 1st at 23:00 UTC (2nd at 9am AEST). To hit the 1st at 9am AEST, we need `'0 23 * * *'` on the last day of prev month. Simplest: `'0 23 1 * *'` fires 1st UTC which is already 1st in BNE until 10am UTC. 23:00 UTC on the 1st = 2nd at 9am AEST. So we need `'0 23 28 * *'`... 

  Let me simplify: Brisbane is UTC+10 (AEST, no DST for QLD).
  - 9:00 AM AEST = 23:00 UTC **previous day**
  - Monday 9am AEST = Sunday 23:00 UTC → cron: `0 23 * * 0`
  - 1st of month 9am AEST = last day of previous month 23:00 UTC — this is tricky with cron. Better to schedule for `0 23 * * *` daily and have the function check if tomorrow in AEST is the 1st. Or use a simpler approach: schedule at `0 0 1 * *` UTC (1st at 10am AEST — close enough, 1 hour later). 

  **Decision**: Weekly at `0 23 * * 0` (Monday 9am AEST). Monthly at `0 0 1 * *` (1st at 10am AEST — 1 hour after requested but avoids complexity). Or `0 23 1 * *` which is 2nd at 9am — wrong. Let's do `0 23 28-31 * *` and have the function check if tomorrow is the 1st in AEST timezone. This is the cleanest approach.

  **Final decision**: 
  - Weekly: `0 23 * * 0` → Monday 9am AEST ✓
  - Monthly: Run daily at `0 23 * * *` but the function with `type=monthly` checks if the next day in AEST is the 1st of the month. Only sends if true. This handles variable month lengths correctly.

  Actually, even simpler — just schedule two separate cron jobs and for monthly, accept the 1-hour offset: `0 0 1 * *` = 1st at 10am AEST. That's close enough and much simpler.

  I'll go with `0 0 1 * *` for monthly (10am AEST on the 1st) for simplicity, and note it in the plan.

### Files to Create/Edit
1. **Create** `supabase/functions/send-winner-reminder/index.ts` — single function handling both weekly and monthly reminders
2. **Edit** `supabase/config.toml` — add `verify_jwt = false`
3. **SQL insert** (not migration) — two `cron.schedule` calls for the weekly and monthly jobs

### Email Content
Both emails will use Birdies branding with a CTA button linking to `https://hub.birdiesbayside.com.au/admin/sgt-manager` so the admin can go directly to approve the winner.

