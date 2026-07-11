# Extend Booking Feature

Let customers add more time to an in-progress booking from their phone, with a QR code on the Bay Controller warning popup as the fast path.

## 1. Backend: `extend-booking` edge function

New edge function mirroring `reschedule-booking`'s pricing + payment logic.

**Inputs:** `booking_id`, `additional_hours` (1–3)

**Rules:**
- Booking must be `confirmed` and currently active (between `start_time` and `end_time + 10min` buffer).
- New `end_time` must not exceed operating hours for that day (`operating_hours` table).
- New `end_time` must not overlap any other confirmed/pending booking on the **same bay** (no bay switching).
- Total duration cap: same as booking config (4hr).

**Pricing:** recalculate cost of the additional hours using the same tier/peak logic as reschedule (`calculateHourlyRate`). Charge extra to balance first, then saved card. If no card + insufficient balance → 400 with "Add a card to extend."

**Update:** bumps `end_time`, `duration_hours`, `total_price`, `updated_at`. The Bay Controller precision scheduler already re-reads live bookings, so plugs/apps stay on automatically — no changeover fires.

## 2. Availability helper endpoint

Add a lightweight read the dialog uses to know max extendable hours:

- Query next confirmed/pending booking on same bay after current `end_time`.
- Query operating hours close time for that date.
- `maxExtendHours = min(gap_to_next_booking, gap_to_close, 4 - current_duration)` rounded down to whole hours.

Done client-side in the dialog via existing `bookings` and `operating_hours` tables (no new function needed).

## 3. Frontend: `ExtendDialog` component

Shown from My Bookings on any active booking (start ≤ now ≤ end + 10min).

Dialog contents:
- Current booking summary
- Extend by: 1hr / 2hr / 3hr buttons (only shown if `maxExtendHours` allows)
- If `maxExtendHours = 0`: message "Bay is booked at 4:00pm — no additional time available. You can book another bay from the home screen."
- Live price breakdown (additional hours × rate, peak/off-peak label)
- Payment source line (Balance / Card ending 4242)
- Confirm button → calls `extend-booking`

## 4. My Bookings changes

- Add "Extend" button on any booking where `now` is between start and end+10min.
- Auto-open dialog when URL contains `?extend=<booking_id>` (from QR deep link).

## 5. Bay Controller: QR toggle in Notifications

In the Notifications config section, add per-notification toggles:

- "Show Extend QR code" checkbox on each notification (5min, 1min)
- Saved to `notificationConfig.notifications[].showExtendQr` in localStorage

## 6. Popup enhancement

Update `show-notification-popup` IPC handler (electron/main.js) to accept `extendQrUrl` param. When present, render a QR code + "Scan to extend your session" line beneath the message.

QR encodes: `https://hub.birdiesbayside.com.au/my-bookings?extend=<booking_id>`

QR generated inline via a lightweight approach (server-side via `api.qrserver.com` image URL, no npm dep needed in Electron).

BayController.tsx passes the URL + toggle state through when calling `showNotificationPopup`.

---

## Technical notes

- `end_time` overlap check uses same query pattern as `reschedule-booking`.
- Booking times remain Brisbane local (AEST/UTC+10) — same parsing as the reschedule 10-min guard we just added.
- No changes needed to Bay Controller scheduler, plugs, GSPro launch, or CSV watcher — they all key off live DB `end_time`.
- Reuses `pricing_config` + `calculateHourlyRate` for consistency.
- Deep-link `?extend=<id>` cleared from URL after dialog opens to avoid re-triggering.
- Preload/electron.d.ts updated to accept optional `extendQrUrl` param.

## Out of scope

- Suggesting alternate bays (per your call — they can just book fresh).
- Extending completed bookings.
- Partial-hour extensions.
