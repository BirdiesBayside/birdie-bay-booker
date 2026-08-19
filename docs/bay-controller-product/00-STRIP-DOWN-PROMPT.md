# 00 — Strip-Down Prompt

Remix the Birdies project first. Then paste **everything inside the fenced block below** as
your first message in the remix. It is written to be executed verbatim by the agent.

Do not run this in the live Birdies project.

---

````text
STRIP-DOWN: convert this project into a standalone Bay Controller product.

This project is a remix of a golf-simulator venue platform. I only want the Windows Bay
Controller app and the minimum backend it needs. Delete everything else. Work through all
steps in one go, then report what remains.

## STEP 1 — KEEP THIS LIST (do not delete or gut any of it)

- electron/main.js, electron/preload.js, electron/tapo_control.py, electron/watchdog.bat,
  electron/build.bat, electron/build_tapo.bat, electron/package.json, electron/icon.png,
  electron/README.md
- src/pages/BayController.tsx
- src/pages/WelcomePreview.tsx
- src/bay-controller-main.tsx
- bay-controller.html
- vite.config.electron.ts
- .github/workflows/build-electron.yml
- src/components/bay-controller/** (AppRestoreSettings.tsx, PlugDiagnostics.tsx)
- src/components/ui/** (shadcn kit), src/hooks/use-toast.ts, src/hooks/use-mobile.tsx,
  src/lib/utils.ts, src/index.css, tailwind.config.ts
- src/hooks/useAuth.tsx, src/hooks/useAdminAuth.tsx, src/components/auth/AuthForm.tsx
  (keep as the staff login shell — strip any membership/tier logic inside them)
- src/hooks/useBayControllerLogger.ts
- src/integrations/supabase/** (auto-generated, leave alone)
- supabase/functions/bay-controller-api/ (will be rewritten in a later step, keep for now)

## STEP 2 — DELETE THESE (files, routes, imports, and any now-dead helpers)

Pages: src/pages/Booking.tsx, BookingSuccess.tsx, MyBookings.tsx, MyAccount.tsx,
Dashboard.tsx, Membership.tsx, CardAdded.tsx, Gift.tsx, Clubhouse.tsx, Feedback.tsx,
Unsubscribe.tsx, PrivacyPolicy.tsx, BirdiesGuide.tsx, SimCupRegister.tsx, SwingLab.tsx,
SwingLabProgress.tsx, BayOrder.tsx, Index.tsx (replace with a controller landing page),
all Comp*.tsx, all League*.tsx, all Embed*.tsx, src/pages/marketing/**,
and every file in src/pages/admin/** EXCEPT a new AdminBayControl equivalent (see step 4).

Components: src/components/admin/** (except nothing — delete the whole folder),
src/components/booking/**, src/components/league/**, src/components/marketing/**,
src/components/membership/**, src/components/legal/**, src/components/sgt/**,
src/components/NotificationBell.tsx, src/components/Seo.tsx (keep if you want basic SEO),
src/components/BrandLoader.tsx (rebrand or delete).

Hooks/libs: every hook and lib file relating to bookings, pricing, memberships, SGT,
competitions, marketing, analytics, push notifications, range stats, highlights, or Stripe —
including src/hooks/useBooking.ts, usePricing.ts, useSavedCard.ts, usePushNotifications.ts,
useActiveTourData.ts, useAnalyticsData.ts, useRevenueTrend.ts, useOperatingHours.ts,
useLocalCompRealtime.ts, usePlayerScorecards.ts, useSGTEmbedData.ts, useSgtNicknames.ts,
useExemptPlayers.ts, useFirstTimerFlags.ts, useIframeAutoResize.ts, useInAppBrowser.ts,
and src/lib/pricing-utils.ts, league-block.ts, sgt-api.ts, range-stats.ts, range-sync.ts,
pga-tour-averages.ts, web-push.ts, terms-version.ts, share-video.ts.
KEEP src/lib/brisbane-time.ts but rename/generalise it to a timezone helper that reads the
venue timezone from config instead of hardcoding Australia/Brisbane.

Edge functions: delete every folder in supabase/functions/ EXCEPT bay-controller-api and
_shared. That removes all Stripe, membership, marketing, SGT, comp, gift card, door access,
POS, feedback, push, and highlight functions.

Mobile/native: delete android/**, capacitor.config.ts, trapeze.yaml,
scripts/patch-ios-appdelegate.js, public/push-sw.js, and the Capacitor dependencies in
package.json.

Static/docs: delete public/bayside/**, public/birdies-guide.html, src/assets/** (venue
photos/videos/logos), docs/platform/** and docs/LEAGUE_HIGHLIGHTS_SETUP.md.
KEEP docs/bay-controller-product/** — it is the spec for this build.

## STEP 3 — GUT THESE FEATURES INSIDE THE CONTROLLER ITSELF

In electron/main.js, electron/preload.js, src/types/electron.d.ts and
src/pages/BayController.tsx, remove:

- All OBS recording and highlights code: delete electron/obs-controller.js and
  electron/hole-splitter.js, and every IPC channel starting `obs-`, plus
  capture-scorecard-screenshot, read-protee-current-screen, set-protee-display, and every
  `sgt-*` overlay channel (show-sgt-icon-overlay, show-sgt-info-overlay,
  toggle-sgt-info-overlay, update-sgt-icon-position, close-sgt-icon-overlay,
  close-sgt-info-overlay).
- The Ctrl+Shift+F12 highlight hotkey, recording watchdog, orphan reaper, tus upload code,
  and the `should_record` / `recording_*` API calls.
- Range CSV ingest: scan-desktop-csvs, delete-desktop-csv, the desktop fs.watch,
  and ingest_range_session calls.
- Bay ordering / POS notifications.
- Any Birdies copy, phone numbers, URLs, or league references in the Welcome Window HTML,
  notification popups and extension QR codes — replace with placeholders driven by venue
  config.

KEEP (these are the product): the precision scheduler, state machine, plug control,
run-app-sequence and display positioning, close-apps, welcome windows, notification popups,
kiosk mode, auto-update, GSPro baseline + per-user settings restore, auto-paste, logging.

## STEP 4 — REPLACE THE DATA MODEL (multi-tenant)

Drop all inherited tables. Create the schema exactly as specified in
docs/bay-controller-product/03-DATA-CONTRACT.md, section "Target schema":
venues, venue_users, bays, bay_devices, bay_pcs, bay_commands, sessions, api_keys,
controller_logs, player_settings. Every table carries venue_id, has RLS scoped to
venue membership, and has explicit GRANTs. service_role for controller/API writes.

Then build a minimal staff dashboard (single admin area) with: Bays & live status,
Sessions list, Controller logs, Device/plug setup, API keys, Kiosk unlock code, Venue
settings (name, timezone, logo, contact number, simulator exe paths).

## STEP 5 — REPLACE THE BOOKING COUPLING WITH THE UNIVERSAL API

The controller must no longer read a `bookings` table. Implement the push API exactly as
specified in docs/bay-controller-product/04-UNIVERSAL-SESSION-API.md as an edge function,
and have the controller read `sessions` for its own bay. Add manual/walk-in session start
in both the controller UI and the dashboard.

## STEP 6 — PLUG DRIVER LAYER

Refactor plug control per docs/bay-controller-product/05-PLUG-DRIVER-LAYER.md: one driver
interface (on/off/status/test) with Shelly, Tapo, Kasa, Tuya, generic HTTP and MQTT
drivers, brand selected per device in settings. One installer for all countries.

## STEP 7 — PAIRING

Implement pairing per docs/bay-controller-product/06-PAIRING-AND-CONFIG.md: the app asks
for a pairing code on first run, binds the PC to a bay, and stores config locally.
Remove any hardcoded bay numbers or the 1–6 bay limit.

## STEP 8 — REBRAND

- electron/package.json: name, productName, appId, artifactName, publish repo.
- .github/workflows/build-electron.yml: update the latest.yml release URL to the new repo.
- index.html: new <title> and <meta name="description">.
- Replace the Birdies colour tokens in src/index.css and tailwind.config.ts with neutral
  product tokens, still as semantic tokens — no hardcoded colour utilities in components.

## STEP 9 — VERIFY BEFORE REPORTING DONE

- `rg -i "birdie|sgt|ambrose|stripe|membership|tapo-only|bayside"` returns nothing outside
  docs/ and the Tapo driver.
- The web app builds and the only routes are: staff login, dashboard, bay controller,
  welcome preview, 404.
- `npx vite build --config vite.config.electron.ts` succeeds.
- supabase/functions contains only the controller API, the sessions API and _shared.
- No table outside the list in STEP 4 exists.
- Every remaining table has RLS enabled and explicit GRANTs.

Report: files deleted, tables created, endpoints exposed, and anything you kept that I
listed for deletion (with the reason).
````
