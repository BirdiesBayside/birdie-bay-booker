# 14 — Marketing Campaigns & Segments Handover (full build package)

Everything needed to lift the Admin → Marketing stack into a remixed project and keep
extending it. Companion docs: `05-NOTIFICATIONS.md` (transactional email/SMS + the shared
email wrapper) and `06-INTEGRATIONS.md` (Resend + Lovable AI Gateway secrets).

---

## 1. What it is

`src/pages/admin/AdminMarketing.tsx` (~1,750 lines) is the marketing console. Six tabs:

| Tab | Component | Purpose |
| --- | --- | --- |
| Campaigns | inline in `AdminMarketing.tsx` | Compose, pick recipients, test send, send, history |
| Templates | inline | Reusable body-only HTML templates (`marketing_templates`) |
| Segments | `src/components/admin/MarketingSegments.tsx` | Full CRUD on saved audiences + AI Import |
| Reviews | `src/components/admin/ReviewApprovals.tsx` | Google review reward approvals |
| Feedback | inline | First-session feedback responses + manual send |
| Sim Cup | inline | Event registrations (`sim_cup_registrations`) |

Global email header/footer are **not** here — they live in Admin → Settings →
`src/components/admin/EmailLayoutEditor.tsx` (`email_layout` table) and are applied to
every marketing send.

---

## 2. Hard rules (these were all bug fixes — don't regress them)

1. **Body only.** A campaign/template stores *body HTML only*. The header and footer come
   from `email_layout` at send time via `_shared/email-wrapper.ts`. The composer shows a
   tips box saying exactly this.
2. **The subject is only the subject.** It must never be injected into the body as an `h1`
   — `buildEmailTemplate`'s heading is conditional for this reason. Admins write their own
   heading in the body.
3. **Unsubscribe link is injected *inside* the green footer block**, as the last row of the
   footer's inner table — never as a separate strip bolted underneath.
4. **Suppression is enforced server-side**, in `send-marketing-email`, not in the UI:
   anyone with `profiles.marketing_opt_out = true` **or** a row in
   `marketing_unsubscribes` is dropped from the recipient list before sending.
5. **Manual mode wins.** When individual customers are ticked, segment/tier filters are
   ignored entirely — the recipient count reflects only the picked people.
6. **Customer search splits the query into terms** and matches each across first name, last
   name and email — "tim c" must find Tim Cooper.
7. All admin recipient queries use **`.range()` chunking** (PostgREST caps at 1,000 rows);
   the customer base is ~900+ and grows.
8. Absolute URLs only in email HTML. Relative paths break in mail clients.

---

## 3. Database

| Table | Columns of note |
| --- | --- |
| `marketing_campaigns` | subject, html body, recipient snapshot, `status` (`draft`/`sending`/`sent`), sent/failed counts, `created_by` |
| `marketing_templates` | name, subject, body HTML, category |
| `marketing_segments` | name, description, member list (emails), `created_by` |
| `marketing_unsubscribes` | email + timestamp — the audit log of opt-outs |
| `email_layout` | single-row global header/footer HTML |
| `profiles.marketing_opt_out` | the authoritative opt-out flag |
| `sim_cup_registrations` | name, email, phone, shirt size |
| `feedback_responses`, `feedback_emails_sent` | first-session feedback loop |
| `google_review_rewards` | review reward approvals ($15 credit) |

All admin-only: RLS enabled with admin-role policies via `has_role()`, plus the standard
GRANT block. `sim_cup_registrations` additionally allows public inserts (the signed-out
landing page at `/sim-cup`) but not public reads.

---

## 4. Edge functions

| Function | Role |
| --- | --- |
| `send-marketing-email` | The sender. Suppression → template tag replacement → layout wrap → unsubscribe injection → batched Resend send → campaign status update |
| `segment-ai-match` | AI Import: parses CSV / pasted text / plain-English criteria into matched customers for admin approval |
| `marketing-unsubscribe` | Sets `profiles.marketing_opt_out` and logs to `marketing_unsubscribes`; token-verified |
| `send-bulk-email` | Older ad-hoc bulk sender (Admin → Bulk Email) |
| `send-feedback-request` | Cron-driven first-session feedback request |
| `resend-first-session-emails` | Backfill/repair tool for the promo |

### `send-marketing-email` internals
- Runs the send as a **background task** and returns immediately, so the UI never times out
  on large lists.
- Suppression list built from `profiles.marketing_opt_out` + `marketing_unsubscribes`.
- Template tags: `{first_name}`, `{last_name}`, `{email}`, and `{reset_link}` (generates a
  real password-reset link per recipient).
- Batches of **50** with a small delay between batches to stay under Resend rate limits.
- Unsubscribe token = first 8 bytes of `SHA-256(lowercased email + salt)`; the link points
  at `${SITE_URL}/unsubscribe?email=…&token=…` → `src/pages/Unsubscribe.tsx`.
- `campaign_id` is optional — **test sends pass none**, and the campaign-status update is
  skipped in that case.
- On completion writes `status: "sent"` plus counts back to `marketing_campaigns`.

### `segment-ai-match` internals
- Pulls the whole `profiles` roster with `.range()` chunking.
- Calls Lovable AI Gateway, model **`google/gemini-2.5-flash`**, using **tool calling** so
  the model returns structured matches rather than prose.
- Accepts up to 60,000 characters of input; rejects empty input.
- Returns candidate matches with a reason — **the admin approves before anything is saved**
  to a segment. Never auto-create a segment from AI output.

---

## 5. Recipient model (Campaigns tab)

Selection is layered; the final list is the intersection unless manual mode fires:

1. **Membership tiers** — multi-select popover with checkboxes (Visitor, Weekday, Par,
   Birdie, Eagle, Albatross). Multiple tiers allowed.
2. **Custom segment** — dropdown of saved `marketing_segments`.
3. **Individual customers** — searchable list with tick boxes and removable pills.
   Ticking anyone switches to **Manual Mode**: filters above are ignored.
4. **Save as Segment** — persists the currently ticked people as a named segment for reuse.
5. **Send Test Email** — sends the fully wrapped email to one address, no campaign row.

A live recipient count sits above the send button and must always reflect the rules above.

---

## 6. Segments tab (`MarketingSegments.tsx`)

- Create / rename / edit / delete segments.
- Manual add: search customers and tick them into the segment.
- **AI Import**: paste a CSV, a raw list of names/emails, or a plain-English description
  ("eagle members with more than 5 bookings"). The function returns matches, the admin
  reviews and unticks any false positives, then saves as a segment.
- Segment membership is stored as an email list — it is a *snapshot*, not a live query, so
  a segment doesn't drift when tiers change. Re-run the AI import to refresh.

---

## 7. Related surfaces (same email plumbing)

- `src/pages/Unsubscribe.tsx` — public landing page for the footer link.
- `src/components/admin/EmailLayoutEditor.tsx` — global header/footer; changing it changes
  every marketing and notification email at once. Preview before saving.
- `src/components/admin/LoyaltyPromoSettings.tsx`, `GiftCardsSection.tsx`,
  `CustomerAlertsSection.tsx` — other outbound comms that share the wrapper.
- `src/pages/admin/AdminCustomers.tsx` — Import / Export dropdown; export the filtered or
  selected customers as CSV, which feeds straight back into AI Import.

---

## 8. Porting checklist

1. Copy `src/pages/admin/AdminMarketing.tsx`, `src/components/admin/MarketingSegments.tsx`,
   `ReviewApprovals.tsx`, `EmailLayoutEditor.tsx`, `src/pages/Unsubscribe.tsx`.
2. Copy edge functions: `send-marketing-email`, `segment-ai-match`,
   `marketing-unsubscribe`, `send-bulk-email`, plus `_shared/email-wrapper.ts`.
3. Recreate the tables in section 3 — **CREATE TABLE → GRANT → ENABLE RLS → POLICY** — and
   add `marketing_opt_out boolean default false` to `profiles`.
4. Secrets: `RESEND_API_KEY`, `SITE_URL` (the hub domain, used for unsubscribe links),
   `LOVABLE_API_KEY` for AI Import.
5. Verify the sending domain in Resend and set the from-address for the new venue.
6. Seed one `email_layout` row with the client's header/footer before the first send —
   an empty layout sends a bare body.
7. Change the unsubscribe token salt string in `send-marketing-email` /
   `marketing-unsubscribe` (they must match each other).
8. Smoke test in order: Send Test Email → check header/footer/unsubscribe render → click
   unsubscribe → confirm `marketing_opt_out` flips → send a 2-person campaign and confirm
   the unsubscribed address is skipped and the campaign shows `sent` with correct counts.

---

## 9. Ideas / extension points (safe places to build)

- Scheduled sends: add `scheduled_for` to `marketing_campaigns` and a `pg_cron` job that
  invokes `send-marketing-email` — the function is already background-task shaped.
- Open/click tracking: Resend webhooks into a `marketing_events` table.
- A/B subject testing: two subjects on a campaign, split the recipient array.
- Dynamic segments: store a criteria JSON alongside the email list and re-resolve at send.
- Per-recipient send log: today only aggregate counts are stored on the campaign.

## 10. Known traps

- Editing a template does **not** retro-change a sent campaign — bodies are snapshotted.
- A campaign stuck on `sending` means the background task died mid-run; check function logs
  and the sent count before re-sending, or you'll double-mail the first batches.
- Marketing sends must **never** reuse transactional templates — the unsubscribe footer
  legally belongs on marketing only.
- If recipient counts look capped at exactly 1,000, someone dropped the `.range()` chunking.
