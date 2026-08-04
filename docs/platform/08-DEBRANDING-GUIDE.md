# 08 — De-branding Guide (run this in BASELINE HUB only)

**Do not run any of this in the Birdies project.** This document is the instruction set
for the agent working inside the freshly remixed `BASELINE HUB` project.

Goal: a **neutral blank canvas** that still boots, still works, and contains no Birdies
identity, no real people, no money, no Stripe products, no membership tiers and no
pricing. A client project remixed from Baseline should be configurable entirely through
the Admin UI plus a short list of code constants.

Work top to bottom. Each step is independently verifiable.

---

## Step 1 — Tenant configuration layer

Create a single source of truth so no component ever holds a venue literal again.

1. Migration: `tenant_settings` table (single row, admin-writable, public-readable) with
   columns for `venue_name`, `legal_entity`, `abn`, `booking_domain`, `hub_domain`,
   `support_phone`, `support_email`, `sender_email`, `admin_alert_email`,
   `address_line`, `suburb`, `state`, `postcode`, `timezone` (default
   `Australia/Brisbane`), `socials` (jsonb).
   Include `GRANT`s, RLS, and an `updated_at` trigger.
2. `src/config/tenant.ts` — typed accessor + React hook, with safe placeholder defaults
   (`"Your Venue"`, `"example.com"`) so a fresh project renders without a configured row.
3. Admin → Settings → new **Venue Details** collapsible section to edit it.
4. Edge functions read tenant values from the database (with an env-var fallback), not
   from literals.

## Step 2 — Purge venue literals

Search and replace across the whole repo:

- `birdiesbayside.com.au`, `hub.birdiesbayside.com.au`
- `info@birdiesbayside.com`, `noreply@birdiesbayside.com`, `admin@birdiesbayside.com`
- The venue phone number
- The words "Birdies", "Birdies Bayside", "Bayside" in user-facing strings

Every occurrence becomes a tenant lookup. Audit **all 90 edge functions** — Stripe
success/cancel URLs and email links are the highest-risk ones. Keep table names,
column names and function names as they are: renaming `sgt_*` or `local_comp_*` buys
nothing and breaks everything.

## Step 3 — Neutralise the brand

- Reset the design tokens in `src/index.css` and `tailwind.config.ts` to a neutral,
  non-AI-looking palette and a neutral font pairing. Keep the token *structure* intact.
- Replace logo, hero video/poster, neon sign and simulator imagery in `src/assets/` with
  neutral placeholders.
- Rewrite marketing page copy (`src/pages/marketing/*`) to generic venue copy with
  tenant merge values.
- Rewrite `index.html` title/description/OG tags and `src/components/Seo.tsx` defaults.
- Rewrite `public/birdies-guide.html` as a generic `quick-start-guide.html`.
- Legal pages: keep the clause structure (media/recording consent, personal liability and
  injury, cancellation) and inject the venue name. Reset the version string in
  `src/lib/terms-version.ts` so a new venue's customers accept once.

## Step 4 — Delete Birdies-only assets

- `public/bayside/` in its entirety (sim-centre questionnaire, setup checklist, codebase
  audit) — these are Bayside Golf's own sales assets and must never ship to a client.
- `supabase/functions/send-questionnaire-submission` and the `sim_centre_submissions`
  table, plus the `sim-centre-brand-guides` storage bucket.
- Any Birdies-named test functions (`test-league-winner-email`).
- `android/app/google-services.json` (client supplies their own).

## Step 5 — Empty the commercial layer

Baseline must ship with **no** commercial configuration at all.

- `pricing_config`: empty. The app must render correctly with zero tiers — visitor-only,
  no membership marketing, membership pages showing an empty state.
- Reduce `MEMBERSHIP_TIERS` in `src/types/booking.ts` to an empty/derived default so tier
  metadata comes from `pricing_config` rather than code. Anywhere a hardcoded tier name
  (`birdie`, `eagle`, `weekday`) drives logic, drive it from the tier row instead —
  including league eligibility, which should read a `grants_league_access` flag on
  `pricing_config` rather than a tier name.
- No Stripe products or price IDs anywhere, including migrations.
- Empty: `pos_products`, gift cards, `loyalty_promo_settings` defaults, marketing
  campaigns and templates beyond the plain defaults.
- Verify the booking flow still completes end-to-end with a single visitor rate created
  from scratch in Admin.

### Step 5a — DO NOT remove billing *logic* (read this twice)

Emptying the commercial layer means deleting **data** (products, price IDs, tiers, POS
items). It does **not** mean deleting or simplifying the billing **code**. Every rule
below was written in response to a real production incident on the Birdies platform,
usually one that cost real money. A fresh agent looking at an empty `pricing_config` will
be tempted to "simplify" these paths because nothing appears to use them. Do not.

Preserve, unchanged and untested-by-deletion:

- **Single active subscription rule.** `create-membership-checkout` must switch tiers via
  `stripe.subscriptions.update()` with proration and `billing_cycle_anchor: "unchanged"` —
  never by creating a second subscription. Cause: a member was billed for two tiers in the
  same week. Never replace this with "cancel then create".
- **Webhook idempotency.** The `stripe_processed_events` table plus the global guard at the
  top of `stripe-webhook` must survive. Cause: duplicate cancellation emails and repeat
  charges from Stripe redelivering the same event.
- **Checkout idempotency keys.** Random-UUID-suffixed idempotency identifiers so a customer
  can retry immediately after a failure without being blocked or double-charged.
- **Activation on `active` only.** A tier upgrade is applied on the `active` status webhook,
  not at checkout creation. Cause: unpaid members getting member pricing.
- **Payment-failure ladder.** 1st failure → cancel + refund future bookings, set
  `profile.payment_failed_at`, force visitor pricing (still bookable), send heads-up email.
  2nd failure → downgrade to visitor and void the invoice. On `payment_succeeded`, clear the
  flag to restore member pricing. Self-serve retry via `MembershipPaymentIssueDialog`.
- **Auto-refund path** for duplicate payments and deleted bookings (reason `duplicate`).
- **Membership audit trail.** `trg_log_membership_tier_change` and `membership_changes`.
- **Immediate-charge policy.** New signups are charged immediately; no trial coupons.
- **Stripe API version pinning.** Keep the pinned version string consistent across every
  function; do not let one function drift.

The correct end state for Baseline is: all of the above code present and working, with
**zero rows** of pricing/product data behind it. Test it by creating one visitor rate and
one membership tier from scratch in Admin, attaching a real test-mode Stripe price, and
running: subscribe → switch tier → fail a payment → recover. If that sequence works on an
otherwise-empty database, the logic survived the de-brand.

A related trap: with `pricing_config` empty, any code that assumes at least one tier exists
will crash rather than render an empty state. Fix those by making the UI tolerate zero rows —
not by re-seeding a placeholder tier, and never by weakening the rules above.


## Step 6 — Data cleanse

A remix copies the database. Baseline must contain zero real records. Write a single
`baseline_reset` migration that truncates (respecting FK order):

```text
bookings, bay_blocks, bay_orders, bar_tabs, pos_transactions,
deposit_transactions, membership_payments, membership_changes,
stripe_processed_events, booking_notification_log, adhoc_sms_log,
range_sessions, range_shots,
recording_sessions, recording_clips, recording_holes, highlight_clips, highlight_events,
sgt_members, sgt_tour_members, sgt_scorecards, sgt_tournaments, sgt_tours,
sgt_tour_standings, sgt_monthly_standings, sgt_monthly_awards, sgt_weekly_prizes,
local_competitions, local_comp_teams, local_comp_players, local_comp_saved_teams,
local_hcp_adjustments,
clubhouse_posts, clubhouse_comments, clubhouse_upvotes,
announcements, announcement_reads, push_tokens,
door_codes, door_code_events,
feedback_responses, feedback_emails_sent, google_review_rewards,
loyalty_credits_issued, marketing_campaigns, marketing_unsubscribes,
comp_survey_responses, comp_partner_board, whats_on_events,
bay_controller_logs, bay_commands, bay_devices,
sgt_club_config, sgt_api_config,
profiles, user_roles
```

Then delete all `auth.users` rows through the Auth admin API (not SQL). Leave exactly one
admin account for yourself, or none and create one on first run.

Confirm afterwards that every listed table returns 0 rows.

## Step 7 — Seed structure only

A second `baseline_seed` migration inserts obviously-placeholder structure so the app is
usable immediately:

- 6 bays named `Bay 1`…`Bay 6`
- `operating_hours` 05:00–23:00 every day; `staffed_hours` empty (unstaffed by default)
- Default `email_layout` header/footer using tenant merge values
- The full set of default `email_templates` and `sms_templates` with neutral copy
- Default `door_access_settings` (disabled)
- No pricing, no members, no products

## Step 8 — Setup Status page

Add Admin → Setup Status: a red/green checklist covering venue details, pricing tiers,
bays, operating hours, email domain, Stripe keys, SMS, SGT (optional), Cloudflare
(optional), Tuya (optional), and push. Each row links to the section that fixes it. This
is what makes a client project launchable without institutional memory.

## Step 9 — Documentation carry-over

Keep `docs/platform/` in Baseline. Update `07-TENANT-CONFIG.md` as items move from
"hardcoded" to "database-driven". Paste `memory/CORE-RULES.md` into the new project's
Knowledge settings so it loads on every message.

## Step 10 — Verification before declaring Baseline done

- `rg -i birdies src public supabase electron index.html` returns nothing user-facing.
- Fresh sign-up → book a session → pay → receive email works with only Admin-entered
  config.
- Every admin page loads with empty data (no crashes on zero rows).
- The build passes and no route 404s.
