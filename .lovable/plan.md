## Goal

Make the whole SGT subsystem configurable from a settings panel in SGT Manager (club URL + SGT username/password), so a replicated client project only needs those three fields entered to make every SGT feature work — no code edits, no secrets set by hand.

## Audit findings (verified)

**1. The club is hardcoded in 9 edge functions.** `const CLUB_URL = "birdiesbayside"` appears in `sgt-auto-register`, `sgt-sync`, `sgt-sync-eligible`, `sgt-cleanup-ineligible`, `sgt-tournament-auto-register`, `sgt-daily-tournament-register`, `sgt-delete-registrations`, `sgt-fix-tees`, `sgt-refresh-api-key`. `sgt-highlight-poller` uses a hardcoded `SGT_CLUB`, and `sgt-api` has a fully hardcoded stats URL. Only `sgt-member-management` and `sgt-register` read `SGT_CLUB_URL` from env (and `sgt-member-management` falls back to `birdiesbayside`).

**2. Credentials come from env only.** `SGT_USERNAME` / `SGT_PASSWORD` are read in `sgt-refresh-api-key` and `sgt-register`. A client can't change them.

**3. `sgt_api_config` is a shared singleton with only `api_key`/`expires_at`** — no club, no credentials, no last-refresh status.

**4. Duplicate cron jobs.** `sgt-highlight-poller-1min` and `sgt-highlight-poller-every-minute` both run every minute — the poller is being invoked twice per minute (plus an inline invoke from `bay-controller-api`). This is a live source of the duplicate-session races we've fought.

**5. Overlapping registration functions.** Four functions do overlapping registration work: `sgt-auto-register` (called from the UI), `sgt-tournament-auto-register` (cron 6am), `sgt-daily-tournament-register` (in `config.toml`, **no cron, not called from anywhere** — dead), and `sgt-sync-eligible` (cron 5am). Similarly `sgt-fix-tees` and `sgt-delete-registrations` are one-off tools with no caller.

**6. Two API-key refresh paths.** `sgt-refresh-api-key` deletes-then-inserts; `sgt-register` upserts its own key inline. They can fight over the same singleton row.

## Plan

### 1. Data model — `sgt_api_config` becomes the single source of truth
Add to the existing singleton row: `club_url`, `sgt_username`, `sgt_password` (write-only from the client), `credentials_valid`, `last_verified_at`, `last_error`. Admin-only RLS (`has_role(auth.uid(),'admin')`) with **no SELECT of the password column** — the UI reads a masked view (`has_password: true/false`) via the edge function, never the raw value. Explicit GRANTs for `authenticated` + `service_role`.

Seed the row with the current Birdies values so nothing changes today.

### 2. Shared helper — `supabase/functions/_shared/sgt-client.ts`
One module that:
- loads config from `sgt_api_config` (falling back to `SGT_USERNAME` / `SGT_PASSWORD` / `SGT_CLUB_URL` env for backwards compatibility),
- builds `https://simulatorgolftour.com/sgt-api/club-admin/{club_url}{endpoint}`,
- owns the **single** API-key lifecycle: return cached key if unexpired, else `apikey/create` with the stored credentials, else write `last_error`,
- exposes `sgtGet` / `sgtPost` with one automatic retry on 401/expired key.

Every SGT function is refactored to use it — killing all 11 hardcoded club constants and both duplicate refresh paths.

### 3. Settings UI — gear icon, top-right of SGT Manager
New `SGTSettingsDialog` opened from an icon button beside the page title in `AdminSGTManager.tsx`:
- **Club URL** (with helper text: the slug in your SGT club-admin URL)
- **SGT username** and **SGT password** (password masked; shows "Saved" rather than the value)
- **Test connection** button → calls `sgt-member-management` with a new `verify-credentials` action which does a live `apikey/create` and returns club name + member count on success, or the exact SGT error on failure
- Read-only status block: current API key expiry, last verified, last error
- A short "what to do next" note: add your Tour, then your first Tournament, and automation starts on the next daily run.

Credentials are only ever written through the edge function (service-role), never stored client-side.

### 4. Cleanup (part of the same pass)
- Drop the duplicate `sgt-highlight-poller-every-minute` cron (keep `sgt-highlight-poller-1min`).
- Delete the dead `sgt-daily-tournament-register` function and its `config.toml` entry.
- Fold `sgt-delete-registrations` and `sgt-fix-tees` into `sgt-member-management` as actions (they're admin one-offs, not endpoints).
- Make `sgt-tournament-auto-register` and `sgt-sync-eligible` **no-op cleanly** when no active tour/tournament exists, instead of erroring — so a fresh client's crons stay quiet until they create their first tournament.
- Every SGT function returns a structured `{ ok, skipped_reason }` so the SGT Dashboard can show "waiting for first tournament" rather than a red error.

### 5. Dashboard signal
Small status strip on the SGT Dashboard tab: credentials OK / API key valid until X / active tour / current tournament — so a client can see at a glance whether their setup is live.

## Technical notes
- No behaviour change for Birdies: the config row is seeded with today's values and the env fallback stays in place.
- Password stored in the DB rather than Supabase secrets because the client must be able to change it themselves; it is admin-RLS protected, never selected by the browser, and only read by service-role edge functions. If you'd rather it live in secrets and be rotated by us, say so and I'll swap that piece.
- All timing stays Brisbane-based; crons are unchanged apart from the duplicate removal.
