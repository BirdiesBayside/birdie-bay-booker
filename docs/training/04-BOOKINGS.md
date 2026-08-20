# 04 — Bookings & Availability

Reference: `docs/platform/01-BOOKING-ENGINE.md`

## What the customer sees

Pick a date, see a grid of bays and time slots, pick a start time and duration, see a price, pay,
get a confirmation email and SMS with their door code. Later they can view, reschedule, extend or
cancel it from My Bookings.

## What the admin sees

The Admin Timetable: a grid of bays down one side and time across, showing every booking. Staff
can add bookings, block out a bay for maintenance, add internal notes, move bookings, and see
flags such as first-time customers.

## What happens behind the scenes

1. Availability is worked out from existing bookings plus the venue's operating hours.
2. Price is calculated from the pricing configuration — peak vs off-peak rate, and the customer's
   membership tier.
3. A **pending** booking row is created, then payment is taken, then it becomes **confirmed**.
4. Confirmation notifications go out, and a door code is issued for the booking window.
5. The Bay Controller picks the confirmed booking up and runs the bay around it.

## Rules that must not be broken

- **Timezone.** Every date calculation and every displayed time uses the venue timezone helper.
  Never bare date formatting.
- **See-through pending.** A customer can overlap *their own* stale pending booking, otherwise an
  abandoned checkout locks a slot for everyone.
- **Live sessions are locked.** Once a booking has been running for 10+ minutes it cannot be
  rescheduled or cancelled-for-refund. Someone tried to cancel mid-session and get their money
  back; the block was added.
- **Blocks vs bookings.** Staff maintenance blocks can run up to 12 hours; real bookings cap at 4.
- **Idempotency.** Booking creation and payment must not be able to run twice for one click. A
  customer once received a flurry of duplicate emails and repeat charges from exactly this.

## Common failures

| Symptom | Real cause |
| --- | --- |
| Booking shows on the wrong day | Date formatted without the venue timezone |
| Slot looks taken but nobody booked it | Stale pending row from an abandoned checkout |
| Customer charged twice | Missing idempotency guard on the payment path |
| Booking tagged as a competition on the wrong night | Tag not stripped when the booking was moved outside comp hours |

## Exercise

On your scratch remix:

1. Make a booking end to end in test mode.
2. Change the peak rate in settings and confirm the price changes on the booking page.
3. Ask the agent to explain, with file references, exactly where a booking's status changes from
   pending to confirmed. Verify the answer by reading the files yourself.

## Check yourself

- Why does a pending booking need to be "see-through" to its own owner?
- What stops a customer cancelling for a refund halfway through their session?
- Where does the price actually come from?

→ Next: [05 — Money](05-MONEY.md)
