# Find the whole-site loading regression before changing anything else

## Confirmed so far

- The slowdown affects both the public website and signed-in Hub pages, so it cannot be explained by the My Bookings query or payment-card lookup alone.
- The Lovable Cloud database is currently healthy: 48% memory, 17 of 90 connections, 9% disk, no restarts, and the common booking queries average under 1 ms.
- The live website and Hub page shell currently respond in roughly 0.07–0.21 seconds from an external test. That proves the origin is responding, but it does **not** measure the route from an Australian mobile browser or what happens after the page shell arrives.
- My Bookings shows the same orange B for several distinct stages: downloading its page code, restoring sign-in, and fetching bookings. The current screen therefore hides which stage consumed the minute.

## Investigation — no speculative fixes or publishing

1. **Measure the live delivery path from Australia.** Check DNS, TLS connection, Cloudflare point of presence, time to first byte, cache headers, transfer size, and download duration for the page shell, main JavaScript, CSS, fonts, logo, and each lazy page file. Compare first and second attempts and both custom domains.
2. **Reconstruct the recent regression.** Compare the currently published asset manifest and loading sequence with the last known fast revisions. Identify changes to entry-file size, shared imports, fonts/images/video, cache rules, service workers, lazy loading, and deployment output. Quantify every difference rather than inferring from commit messages.
3. **Instrument the orange-B period.** Add temporary, privacy-safe timing markers for navigation, main script start, app mount, lazy page import, sign-in restoration/token refresh, Terms check, and first page query. Record durations and failures only—never tokens, emails, or booking details.
4. **Capture one real slow phone load.** Use the timing markers on the affected 5G/Wi-Fi device so the full minute is assigned to one of four buckets: network delivery, JavaScript download/execution, sign-in recovery, or page data. Keep a visible diagnostic result available for support if telemetry cannot send during the stall.
5. **Inspect shared startup work.** Verify whether multiple page-level `useAuth()` instances and the global Terms gate create independent sign-in listeners/session checks, and whether a stale refresh token can block every signed-in route. Test signed-out, fresh sign-in, and long-lived session separately.
6. **Check public and authenticated pages independently.** If public pages are equally slow, prioritize asset delivery/cache/DNS. If only signed-in pages stall, prioritize session recovery and shared startup. Do not mix these into one assumed cause.

## Fix only after the measurement identifies the blocker

- **Delivery/cache:** correct the specific asset/header/deployment regression and confirm Australian cache reuse.
- **Oversized or blocked JavaScript:** remove the identified shared dependency or loading waterfall; do not broadly rewrite pages.
- **Sign-in recovery:** create one shared auth provider with one listener and bounded recovery, preserving the existing session and password-reset behaviour.
- **Backend request:** optimize only the exact slow call shown by timing data; do not resize Cloud compute unless health data shows saturation.

## Verification gate

- Test public homepage, Hub dashboard, Book a Bay, and My Bookings on a throttled cold load and a warm repeat load.
- Test signed out, newly signed in, and an existing long-lived session.
- Confirm the first attempt succeeds without refresh and record time to usable content, not merely HTTP response time.
- Compare Wi-Fi and cellular and verify the orange B reports no unexplained gap.
- Remove temporary diagnostics after the cause and fix are confirmed.

## Scope protection

No pricing, bookings, membership, payment, Bay Controller, or Sim Cup behaviour changes. No further performance tweaks will be published until the blocking stage is measured and the proposed fix explains the complete delay.
