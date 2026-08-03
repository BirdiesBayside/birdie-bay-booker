# 10 — Client Onboarding Runbook

From `BASELINE HUB` remix to a live venue. Work in order; each phase depends on the one
before.

## Phase 1 — Project setup

1. Remix `BASELINE HUB` → name it `<Client> Hub`.
2. Paste `docs/platform/memory/CORE-RULES.md` into Project Settings → Knowledge.
3. Connect the project to a new GitHub repository (needed for the Bay Controller build).
4. Fill in Admin → Settings → Venue Details (name, ABN, domains, phone, emails, address).

## Phase 2 — Domains and email

5. Point the client's booking domain and `hub.` subdomain at the project (custom domains).
6. Create a Resend account, verify the sending domain, add `RESEND_API_KEY`.
7. Review the email header/footer and every template with the client's branding.

## Phase 3 — Commercials

8. Create the Stripe account; add `STRIPE_SECRET_KEY` and the webhook secret; register the
   webhook endpoint.
9. Create pricing tiers in Admin (this creates the Stripe products/prices). Decide
   visitor peak/off-peak rates, membership tiers, and which tiers grant league access.
10. Configure the gift card and loyalty/promo settings if the client wants them.

## Phase 4 — Venue configuration

11. Create bays with real names/numbers.
12. Set operating hours and staffed hours; load public holidays.
13. Load POS products and table service hours.
14. Upload branding assets, rewrite marketing copy, publish the Quick Start guide.
15. Review legal pages (terms, privacy, recording consent, liability) with the client and
    bump the terms version.

## Phase 5 — Hardware

16. Bay PCs: disable OOBE/MS-account/auto-update prompts, install the simulator software,
    OBS (if recording), and the Bay Controller (see `09-BAY-CONTROLLER-BUILD.md`).
17. Tapo plugs: pair to venue WiFi, assign to bays by device id.
18. Capture and upload the shared **baseline** simulator settings files.
19. Door keypad: create the Tuya IoT Cloud project, link the Smart Life app account,
    add secrets, configure lead time/expiry, test a 6-digit code end to end.
20. Boom gate (Noke) if applicable.

## Phase 6 — League (optional)

21. Create the client's Simulator Golf Tour club; enter credentials in Admin → SGT Manager
    → settings and run Test Connection.
22. Configure handicap settings, tour and tournament schedule, prize values.
23. Cloudflare Stream account + secrets if the client wants recorded highlights; verify an
    end-to-end recording and upload.
24. Set up the Ambrose comp settings if the client runs one.

## Phase 7 — Mobile (optional)

25. New Firebase project, `google-services.json`, FCM v1 credentials.
26. Rename the Capacitor package id, build and submit Android/iOS apps.

## Phase 8 — Go live

27. Walk the full customer journey on the real site: sign up → book → pay → receive
    email + SMS → arrive → door code → bay powers on → session runs → warnings → shutdown.
28. Confirm Admin → Setup Status is fully green.
29. Import existing customers if the client has a list (`import-customer`,
    `AdminCustomerImport.tsx`).
30. Publish, then monitor `bay_controller_logs` and edge function logs for the first week.

## Ongoing

- Improvements are made in Birdies first, ported to BASELINE HUB deliberately, and only
  then offered to clients. Never port a client's bespoke work upstream.
- Each client project has its own secrets, its own GitHub repo, and its own Bay Controller
  release channel.
