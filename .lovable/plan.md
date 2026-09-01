# Membership Fair Use — Terms & FAQ Updates

## Goal
Discourage sign-up-for-one-cheap-session-then-cancel behaviour with clear policy wording in the Terms and the public FAQs. No technical enforcement, no self-serve cancellation, no pause feature — contact-only cancellation stays as-is.

## Changes

### 1. Terms & Conditions — new "Membership Fair Use" section
Edit `src/components/legal/TermsContent.tsx` (single source of truth used by the sign-up dialog and the re-consent gate). Add a new numbered section:

- Memberships are intended for customers who play on a regular (weekly) basis — not for one-off discounted sessions.
- Memberships are charged weekly and may be cancelled at any time by contacting Birdies (email/phone) — there is no self-serve cancellation in the app. The most recent weekly payment is not refunded.
- Minimum expectation: memberships have a 4-week minimum commitment. Cancelling within the first 4 weeks (i.e. after fewer than 4 weekly payments) may be treated as fair-use abuse.
- Birdies reserves the right to refuse or delay re-joining, and to decline future membership sign-ups, for customers who repeatedly join and cancel to obtain cheap casual sessions.
- Members who will be away (e.g. FIFO work, holidays) can request a membership hold by contacting Birdies — billing pauses and reactivates on return, at our discretion.
- Renumber subsequent sections (currently 14 sections; new section inserted after Section 11 "Cancellations and Refunds", and Section 11 gets a cross-reference noting memberships are covered by the fair-use section).

### 2. Terms version bump
Update `src/lib/terms-version.ts` to a new version string (e.g. `2026-09-01-membership-fair-use`) so all signed-in customers are shown the blocking re-acceptance dialog on their next visit.

### 3. FAQs — membership cancellation policy
Edit `src/pages/marketing/MarketingFAQs.tsx`, Membership group:
- Update the existing "Can I cancel any time?" answer: cancellation is contact-only (email or call), no self-serve in the Hub, most recent weekly payment not refunded.
- Add new Q&A: "Is there a minimum membership period?" — memberships are for regular players with a 4-week minimum expectation; memberships aren't intended for one-off cheap sessions; going away (FIFO etc.)? contact us and we'll happily pause and reactivate.

## Not doing (per your choices)
- No re-joining cooldown enforcement.
- No in-app cancellation button (stays contact-only).
- No self-serve hold/pause feature.
- No code or billing-logic changes.

## Files touched
- `src/components/legal/TermsContent.tsx`
- `src/lib/terms-version.ts`
- `src/pages/marketing/MarketingFAQs.tsx`
