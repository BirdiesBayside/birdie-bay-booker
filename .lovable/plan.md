

## Root Cause

There are **two separate auto-registration functions** with different logic, and the wrong one is on the cron.

### The cron job (`sgt-daily-tournament-register`, runs at 6AM Brisbane daily)
- Queries the **local `sgt_tournaments` table** for tournaments with `start_date` matching **today or tomorrow only**
- The "Arnold Palmer Invitational" has `start_date = 2026-02-28`, which is 4 days ago
- The cron would have only tried to register on Feb 27 or Feb 28 — if it failed or the tournament wasn't synced to the local DB yet, registrations were permanently missed
- **There is no retry for tournaments whose start_date has passed but members are still unregistered**

### The better function (`sgt-tournament-auto-register`, NO cron job)
- Queries the **live SGT API** for active tours and tournaments
- Looks for tournaments that are "In Progress", "Active", "Upcoming within 48h", or currently running based on date range
- Checks eligibility (membership + exempt status)
- Much more robust — would catch this tournament since it's still "Upcoming"
- **But it has no cron job, so it never runs automatically**

### Additional issue
The `sgt-daily-tournament-register` cron has **no Authorization header**, which could cause silent failures depending on function configuration.

---

## Plan

### 1. Replace the cron job to use `sgt-tournament-auto-register`
Update the `sgt-daily-tournament-register` cron (job 12) to call `sgt-tournament-auto-register` instead, which queries the live SGT API and catches any active/in-progress tournament — not just ones starting today/tomorrow.

### 2. Fix the cron Authorization header
The current cron for job 12 sends no Authorization header. Add the anon key to match other cron jobs.

### 3. Update `sgt-daily-tournament-register` as a fallback
Modify the function to also check for tournaments where `start_date <= today AND end_date >= today` (currently active) in addition to starting today/tomorrow, so it never misses an active tournament window again.

### Database changes (SQL)
```sql
-- Remove old cron
SELECT cron.unschedule('sgt-daily-tournament-register');

-- Add new cron pointing to the robust function, runs 6AM Brisbane (20:00 UTC)
SELECT cron.schedule(
  'sgt-tournament-auto-register-daily',
  '0 20 * * *',
  $$
  SELECT net.http_post(
    url := 'https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/sgt-tournament-auto-register',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

### Edge function change
Update `sgt-daily-tournament-register` to also query tournaments where `start_date <= today AND end_date >= today` — so if it's ever called directly, it catches active tournaments too.

### Immediate action
After deploying, manually trigger `sgt-tournament-auto-register` to register all members for the current "Arnold Palmer Invitational" tournament right now.

