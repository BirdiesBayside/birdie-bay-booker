# Core Rules — paste into the new project's Knowledge settings

This is an export of the Birdies Hub project memory. Paste the whole file into
Project Settings → Knowledge in any remixed project so the agent loads it on every
message. Delete any Birdies-specific line that no longer applies once the project is
de-branded.

---

## Non-negotiable rules

- **Timezone**: use explicit `Australia/Brisbane` (AEST/UTC+10, no DST) for ALL date logic
  and ALL displayed/reported times, including chat answers and audits. Never use a bare
  `toLocaleString()` — use the helpers in `src/lib/brisbane-time.ts`.
- **Edge functions**: `npm:` imports, native `Deno.serve`, full CORS headers on every
  response including OPTIONS. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS — use it only for
  automated/admin paths.
- **Roles**: never store roles on `profiles`. Roles live in `user_roles` and are checked
  through the `has_role()` security-definer function.
- **RLS + GRANTs**: every new public table needs GRANTs for the roles its policies allow,
  RLS enabled, and explicit policies.
- **Pagination**: use `.range()` chunking for admin queries — PostgREST caps at 1,000 rows.
  Use DB triggers for high-volume aggregate counts.
- **TypeScript**: `ReturnType<typeof setTimeout>`, not `NodeJS.Timeout`.
- **Design**: semantic tokens only, never hardcoded colour utilities.
- **Emails**: always wrap bodies with `_shared/email-wrapper.ts`; absolute URLs only.
- **Stripe**: API version `2025-07-30.basil`; webhooks run with `verify_jwt = false`.
- **Product philosophy**: prioritise customer UX simplicity and low-friction payments over
  complex automated security or cleanup measures.

## Brand (Birdies — replace per client)

Dark theme, minimal. Base green `#1F4C25`, brand orange `#EC622D`, cream `#FFF5E4`.
Anton headings, Inter body. Over-par scores render blue.

## Architecture

- One shared database serves the public booking site and the Hub (admin/league) on a
  separate subdomain; navigation is restricted by domain.
- Bay Controller is a single-instance Electron app whose WebViews load the Hub domain.
  The Welcome Window is the one hardcoded inline HTML exception.
- Bay Controller automation is an explicit state machine: IDLE → PRE_START → …

## Bay Controller timeline

Hardware on at T−3m, apps launch at T−1m, apps close at T−20s, power off at T+0.
Customer settings snapshot is captured at T−3m from session end; a shared baseline plus a
customer snapshot are restored **before** launch, never on close. 5-second cooldown after
an intentional action. Back-to-back bookings bypass the T−20s close and T+0 power-off.
Hard stop for recordings is T−120s. Watchdog restarts the app every 30s if closed.

## Memberships and billing

- New signups are charged immediately; no trial coupons.
- Switching tiers uses `subscription.update` with proration and
  `billing_cycle_anchor: "unchanged"` — never create a second subscription.
- Payment failure ladder: 1st failure → cancel + refund future bookings, flag
  `profiles.payment_failed_at`, force visitor pricing (still bookable), send a heads-up
  email. 2nd failure → downgrade to visitor and void the invoice. Self-serve retry via
  `MembershipPaymentIssueDialog`. `payment_succeeded` clears the flag.
- All webhooks are guarded by `stripe_processed_events` idempotency.

## League

- SGT registration order is club → tour → tournament, always.
- Tournaments start Sunday, end Monday (Brisbane). 6:00am auto-register, 6:00am auto-close.
- Players are provisional until 3 full 18-hole rounds; shown as `(E)`; true handicap set
  from the best 3 of the last 6; monthly points accrue from the 4th round.
- Only complete 18-hole rounds (18 distinct hole entries) count toward handicaps and stats.
- Monthly standings are grouped by `start_date` calendar month, descending 25→1 scale.
- `custom_hcp` always overrides any combo/onboarding handicap.
- Ambrose handicap adjustment on completion: 25% of the team's gap to field average net,
  capped ±2, with −0.5 for a win and −1.5 for back-to-back wins.

## Door access

TTLock keypad codes must be exactly **6 digits** — other lengths silently never reach the
device. Permanent named codes use a 10-year expiry and can be revoked individually.

## Bookings

- See-through availability: a user can overlap their own pending bookings; stale pending
  rows are deleted via RLS.
- No rescheduling or refundable cancellation once a session is 10+ minutes live.
- Duplicate payments and deleted-booking payments auto-refund as `duplicate`.
- Deposits/credits are tracked in `deposit_transactions`.
- Checkout idempotency keys carry a random UUID suffix so retries are immediate.
