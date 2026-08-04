# Clarify de-branding intent: remove identity/data, preserve logic/frames

## What the user asked

1. Confirm that de-branding steps do **not** remove features/logic entirely — they neutralise identity and data while keeping the frames and logic intact for later replacement.
2. Add clarity to `docs/platform/08-DEBRANDING-GUIDE.md` so this distinction is obvious upfront.

## What we will do

Update `docs/platform/08-DEBRANDING-GUIDE.md` with a short "Remove vs Preserve" preamble right after the Goal paragraph, before Step 1.

### Remove

- Birdies identity: name, domain literals, email addresses, phone, logos, hero media, brand colours/fonts.
- Birdies-only sales assets: `public/bayside/`, questionnaire function, `sim_centre_submissions`.
- Real data: all bookings, payments, profiles, auth users, SGT records, recordings, POS products, etc.
- Commercial configuration data: `pricing_config` rows, Stripe price IDs, membership tiers, gift cards, loyalty promos, POS products, marketing campaigns.

### Preserve (neutralise, do not delete)

- All React components, pages, routes, hooks, and UI structure.
- All edge functions and their logic — especially billing logic listed in Step 5a.
- All database tables, triggers, RLS policies, and GRANTs.
- All Bay Controller, SGT, local comp, POS, door access, and notification code.
- The design token *structure*; only the values change.
- The legal clause structure; only venue names and version string change.

## Verification

- Read the updated `08-DEBRANDING-GUIDE.md` and confirm the new table is present and accurate.
- No code changes; only documentation.
