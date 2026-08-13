# Jake Davies — charged card while holding credit

## What the logs show

- 12 Aug, 8:43pm Brisbane: admin added **$50 credit** to Jake's account (balance 0 → 50).
- 12 Aug, 9:37pm Brisbane (54 min later): he booked 19 Aug 7:00pm, **$20 charged to card** (`pi_3U3aT7...`), payment method recorded as `card`. No credit was touched.
- Today 1:32pm: he booked again and it correctly used **balance** ($10), leaving $40.

So the credit was real and available at the time of the card booking — the booking page just didn't know about it.

## Cause

The booking page reads the customer's credit from a cached profile query (5-minute stale time, window-focus refetching deliberately switched off). If the page was already open (or the app was resting in the background) when staff added the credit, the client keeps serving `deposit_balance = 0`. With a zero balance the "Pay with Balance" option is never rendered, so the only path available was card — and the charge decision is made entirely from that stale client-side number, never re-checked against the database.

Today's booking worked because that session loaded fresh after the credit existed.

## Fix

1. **Always load a fresh balance on the booking page.** Refetch the user profile on mount/navigation to the booking flow (no stale cache for balance), so the balance option appears as soon as credit exists.
2. **Re-read the balance at the moment of confirmation.** Before charging, fetch `deposit_balance` straight from the database. If credit covers the price and the client thought it was zero, stop and surface the balance option instead of silently charging the card.
3. **Refresh after credit changes.** Invalidate the cached profile when the app sees a credit change (admin adjustments, promo credits, gift-card redemption) so an open session updates itself.
4. No change to the balance-deduction accounting itself — that path is behaving correctly.

## Jake's $20

Separately from the code fix, the 19 Aug booking should be made right. Options: refund the $20 to his card, or add $20 back to his credit balance (making it $60). Tell me which and I'll action it.

## Technical notes

- `src/hooks/useBooking.ts` — `USER_PROFILE` query uses `STALE_TIMES.SEMI_STATIC`; switch to a short/zero stale time with `refetchOnMount: "always"` for the balance-critical path.
- `src/pages/Booking.tsx` — `handleConfirmClick` branches purely on the in-memory `depositBalance`; add a server read before the card path.
- Global defaults in `src/App.tsx` (`refetchOnWindowFocus: false`) stay unchanged; only the profile query is tightened.
