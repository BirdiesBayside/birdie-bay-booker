## Goal

Build two standalone, brand-aligned HTML pages for **Bayside Golf** that you can lift out of this project and re-host on the Bayside Golf site (or anywhere static):

1. **Sim Centre Onboarding Questionnaire** — what we need from a prospective sim centre to clone the Birdies platform for them.
2. **Sim Centre Setup Checklist** — everything that must be configured (Stripe, secrets, hardware, domains, etc.) for the new platform to behave exactly like Birdies.

Both pages will be self-contained `.html` files (no build step, no React) so you can drop them straight into a Bayside Golf web property.

## Decisions locked in

- **Single-tenant model** — each sim centre gets its own remixed Lovable project. Questionnaire and checklist are written with that assumption (no multi-tenant fields like "centre slug", "tenant id", etc.).
- **Hosted on Bayside Golf** — pages will be plain HTML/CSS, no Lovable runtime dependencies. Logo loaded as a local asset so it travels with the file.
- **Brand**: Instrument Sans (uppercase) headings, Nunito body, green `#04930C`, black `#000000`, off-black `#1C1C1C`, bg grey `#EFEFEF`. Logo on dark hero section (since the supplied logo is designed for dark backgrounds).

## Files to create

```text
public/bayside/
  ├── logo-bayside.png            (copied from upload)
  ├── sim-centre-questionnaire.html
  └── sim-centre-setup-checklist.html
```

Both will be reachable at `/bayside/sim-centre-questionnaire.html` etc. while in this project, then portable as static files.

## Page 1 — Questionnaire

A long-form, sectioned questionnaire. Fields are plain HTML inputs so the prospect can fill it in-browser. **Submit behaviour**: a "Download my answers" button that serializes the form to a JSON file + a "Email to Bayside Golf" `mailto:` button (no backend needed for the rehosted version). Optional: a "Copy as text" button.

Sections:

1. **Business basics** — legal entity, trading name, ABN, primary contact, phone, email, website, social handles.
2. **Location & facility** — address, timezone, opening hours per day, public holidays observed, number of bays, bay numbering scheme, simulator hardware per bay (GSPro / Trackman / Uneekor etc.), TV/projector layout, bar/kitchen present?
3. **Branding** — primary/secondary/accent colours (hex), logo upload notes, heading/body fonts, tone of voice, photography style.
4. **Domains & email** — desired primary domain, hub subdomain, support email, from-address for transactional email, from-address for marketing.
5. **Membership model** — number of tiers, name of each tier, weekly/monthly price, hourly rate, peak vs off-peak rules, restrictions (e.g. weekday only), included perks, league access yes/no.
6. **Pricing & rules** — visitor peak rate, visitor off-peak rate, peak/off-peak time definition (days + hour cutoff), public holiday surcharge %, minimum booking length, maximum booking length, increments.
7. **Payments** — Stripe account ready? country, preferred currency, in-person Terminal needed? gift cards yes/no, deposit/credit balances yes/no.
8. **Bay automation** — smart plug model (Tapo P100 etc.), display/projector control method, simulator software per bay, single-monitor or dual-monitor, warm-up time required, cool-down time required, want pre-start app launch?
9. **Competitions & league** — running an SGT-style league? monthly winner format? local 2-man Ambrose competition? prize structure ($ amounts).
10. **Communications** — Resend account ready? SMS provider preference, push notifications on iOS app yes/no, marketing email frequency.
11. **Access control** — boom gate / door integration needed? provider (Noke, Salto, etc.), after-hours window.
12. **POS / F&B** — selling food & drink via QR? account billing? cash drawer reconciliation time.
13. **Mobile app** — want a branded iOS/Android Capacitor app? Apple Developer account ready? Google Play account ready?
14. **Content** — welcome window house rules (4 short rules), terms & conditions URL, refund policy URL.
15. **Anything else** — free-text.

Each section is a styled card. Required fields marked. Smooth-scroll side nav on desktop, accordion on mobile.

## Page 2 — Setup Checklist

Read-only reference document (no inputs) listing every concrete setup task in order, grouped by phase. Each item has a checkbox (state stored in `localStorage` so the customer can come back to it). Sections:

1. **Lovable project** — remix Birdies, transfer to customer's Lovable account, enable Lovable Cloud, connect GitHub.
2. **Branding pass** — replace logo, swap brand tokens in `src/index.css` and `tailwind.config.ts`, replace favicon, update site title/meta, update welcome-window rules.
3. **Domains & email** — connect primary domain in Lovable, add hub subdomain, configure Resend domain, set `SITE_URL` secret, set transactional from-address.
4. **Stripe** — create Stripe account, switch API key into `STRIPE_SECRET_KEY`, set `VITE_STRIPE_PUBLISHABLE_KEY`, configure webhook endpoint to `stripe-webhook` and store `STRIPE_WEBHOOK_SECRET`, create membership products + prices, populate `pricing_config` table, optional Terminal reader id.
5. **Auth** — verify email confirmation setting, enable Google sign-in, set password HIBP check.
6. **Database seed data** — bays (count + numbering), public holidays, pricing tiers, opening hours, peak/off-peak rules, admin user roles in `user_roles`.
7. **Bay controllers** — install Electron build per bay PC, set bay number, configure Tapo plug IPs + `TAPO_EMAIL` / `TAPO_PASSWORD` secrets, set GSPro/sim paths, run watchdog task, verify single-instance lock, test auto-update from GitHub Releases.
8. **SGT / League (optional)** — set `SGT_USERNAME`, `SGT_PASSWORD`, `SGT_API_KEY`, `SGT_CLUB_URL`, run initial member sync, schedule daily auto-register cron, set monthly block anchor date.
9. **Communications** — set `RESEND_API_KEY`, set `SMS_BROADCAST_USERNAME` / `SMS_BROADCAST_PASSWORD`, configure push notifications (`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`) if iOS app is in scope.
10. **Access control (optional)** — Noke API credentials, gate window times.
11. **POS (optional)** — load `pos_products`, set table-service settings, wire up Stripe Terminal reader id.
12. **Mobile app (optional)** — Apple Developer enrolment, App Store Connect listing, Google Play console, Capacitor build via `trapeze.yaml`, push cert upload.
13. **OpenClaw / admin API** — generate and set `OPENCLAW_API_KEY` if external integrations needed.
14. **Go-live QA** — test booking end-to-end, test membership signup + immediate charge, test failed-payment downgrade, test bay auto power-on T-3min, test back-to-back changeover, test welcome window display.
15. **Handover** — admin training session, log-in handover, escalation contacts, support SLA.

Every item phrased as a single concrete action. Items that depend on customer answers from the questionnaire are tagged "📋 from questionnaire" so it's obvious how the two docs connect.

## Visual / technical spec for both pages

- Single HTML file each. Inline `<style>` block — no Tailwind, no JS framework.
- Fonts loaded from Google Fonts: Instrument Sans + Nunito.
- Layout: dark hero (off-black `#1C1C1C`) with the green Bayside logo top-left, then a light section (`#EFEFEF` page bg, white cards) for content.
- Headings uppercase Instrument Sans, body Nunito 16px.
- Green `#04930C` for primary buttons, links, section accents.
- Mobile-first, max content width ~880px.
- Print stylesheet so it can be exported to PDF cleanly (questionnaire prints with answer fields, checklist prints with checkboxes).
- Vanilla JS only for: questionnaire download/email/copy, checklist localStorage persistence, mobile section toggles.

## Out of scope (for this round)

- Auditing the Birdies codebase for every hardcoded "Birdies" string — flagged in my previous message as option (b). Happy to do that as a follow-up once the questionnaire/checklist is in your hands.
- Backend submission of questionnaire answers (Resend/Sheet/etc.). The download + mailto pattern keeps it host-agnostic. We can add a backend later if you want answers to land in a database.

## Deliverable after approval

Three files added to `public/bayside/`: `logo-bayside.png`, `sim-centre-questionnaire.html`, `sim-centre-setup-checklist.html`. Preview links:

- `https://hub.birdiesbayside.com.au/bayside/sim-centre-questionnaire.html`
- `https://hub.birdiesbayside.com.au/bayside/sim-centre-setup-checklist.html`

You can then download those two HTML files + the logo and drop them into the Bayside Golf site.
