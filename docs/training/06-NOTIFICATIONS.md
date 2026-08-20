# 06 — Notifications: Email, SMS, Push

Reference: `docs/platform/05-NOTIFICATIONS.md`

## The four channels

| Channel | Used for |
| --- | --- |
| Email | Confirmations, receipts, membership events, marketing campaigns |
| SMS | Booking confirmation with door code, urgent alerts |
| Push (mobile app) | Announcements only — deliberately not booking noise |
| In-app notification bell | Announcements and account messages |

## The template model (the bit people get wrong)

Every email template stores **only the body**. The header and footer are global, edited once in
Admin → Settings, and wrapped around every email automatically — transactional *and* marketing.

Consequences to remember:

- Don't paste a full HTML document into a template. Body only.
- Rebranding emails for a new client is a single edit to the global layout.
- The subject lives in the subject field. It must not be repeated at the top of the body.
- The marketing unsubscribe link is built into the global footer, not bolted onto each campaign.

**Merge tags** insert per-customer values (first name, booking time, door code). Always send a test
before a real campaign.

## Marketing campaigns

Choose recipients by membership tier, saved segment, or individually searched customers. Test
sends bypass suppression so you can always see the real result. Real sends respect unsubscribes.

**The 1,000-row trap:** database queries return at most 1,000 rows by default. A campaign meant for
1,400 customers once silently reached 936 of them. Any admin query over a big list must page
through results. If you ever see a suspiciously round number near 1,000, this is why.

## Rules that must not be broken

- Body-only templates; global header/footer.
- Page every recipient query. Never assume one fetch got everyone.
- Respect unsubscribes on marketing; transactional email always sends.
- Show real send failures rather than a green toast that means nothing.

## Common failures

| Symptom | Real cause |
| --- | --- |
| "Sent" but nothing arrived | Recipient unsubscribed/suppressed, or errors swallowed by an async send |
| Some customers missed a campaign | Unpaged query capped at 1,000 rows |
| Email shows the subject twice | Subject injected into the body |
| Branding wrong on one email only | Full HTML pasted into a body-only template |

## Exercise

On your scratch remix:

1. Change the global footer and confirm two different emails both pick it up.
2. Build a small campaign, send a test to yourself, then send to a two-person segment.
3. Ask the agent where recipient paging happens and read that code.

## Check yourself

- Where do you change the logo on every email at once?
- What's the 1,000-row trap and how do you avoid it?
- Which channel do announcements go to on mobile, and why not bookings?

→ Next: [07 — The Admin Hub](07-ADMIN-HUB.md)
