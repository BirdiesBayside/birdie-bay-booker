
# AI Caddy — Admin Support Assistant

A small, inconspicuous "?" icon in the admin layout opens a slide-out chat. The assistant reads project data and logs to diagnose issues, and can perform a vetted list of safe actions (each one requires a confirm tap). Threaded history is saved per admin so you can scroll back.

Also covers renaming the unused OpenClaw gateway since we're not using it anymore.

---

## Scope (per your answers)

- **Capabilities:** Diagnose + safe actions (no bulk ops, no code/schema changes)
- **Audience:** Admins + `custom_segment = 'staff'`
- **History:** Threaded, saved in DB
- **OpenClaw:** rename functions/docs (no functional dependency anywhere else)

---

## What it can do

**Diagnose (read-only):**
- Look up a customer, booking, membership, gift card, credit transaction
- Read recent edge-function logs (`send-booking-notification`, `stripe-webhook`, `sgt-auto-register`, etc.)
- Read `email_send_log`, `adhoc_sms_log`, `bay_controller_logs`
- Pull recent Stripe events (charges, refunds, subscription changes) for a customer
- Read SGT registrations / scorecards / monthly standings
- Read recent local-comp results

**Safe actions (each requires "Confirm" in chat):**
- Refund a booking (full or partial)
- Add/deduct customer credit (with note)
- Resend a booking-confirmation email
- Toggle a customer's booking flag
- Manually re-register a player for the active SGT tournament
- Cancel a booking
- Force-close a stuck SGT tournament

**Explicitly off-limits:**
- Schema/code changes
- Mass email/SMS, bulk refunds, bulk membership changes
- Deleting customers
- Raw SQL
- Reading or echoing secrets

---

## UX

- Floating circular `?` button, bottom-right of every `/admin/*` route. Muted/ghost styling — easy to ignore.
- Click → slide-out `Sheet` (right side, 420px wide) titled "AI Caddy".
- Top: thread sidebar (collapsible) + "New chat" button.
- Composer + transcript using AI Elements (`Conversation`, `Message`, `MessageResponse`, `Tool`, `PromptInput`, `Shimmer`).
- Tool calls render as collapsed accordions inside the assistant message (shows tool name + status, expand for params/result).
- Destructive tool calls render an inline "Confirm / Cancel" card before executing.
- Markdown rendering for assistant text.

---

## Technical details

```text
src/components/admin/ai-caddy/
  AiCaddyButton.tsx          # floating ? button, mounted in AdminLayout
  AiCaddySheet.tsx           # slide-out container, thread list + chat
  AiCaddyChat.tsx            # useChat + AI Elements composition
  AiCaddyToolCard.tsx        # tool-result rendering w/ confirm gate

src/components/ai-elements/  # installed via `bunx ai-elements add ...`

supabase/functions/ai-caddy/index.ts   # streaming chat endpoint
supabase/functions/_shared/ai-caddy-tools.ts  # tool definitions + executors
```

**Backend (`ai-caddy` edge function):**
- AI SDK + Lovable AI Gateway via `_shared/ai-gateway.ts` helper (`google/gemini-3-flash-preview`)
- Verifies the caller's JWT and checks they have `admin` role OR `custom_segment='staff'`
- `streamText` with `stopWhen: stepCountIs(50)`
- Tools defined with Zod schemas. Destructive tools use `needsApproval: true` so the AI SDK surfaces a confirmation step the client renders.
- System prompt: hardcoded role/scope, lists allowed tools, forbids code changes, requires citing data row IDs, requires confirming destructive actions.

**Database (one new migration):**

```text
ai_caddy_threads
  id, user_id, title, created_at, updated_at

ai_caddy_messages
  id, thread_id, role, parts (jsonb — AI SDK UIMessage parts), created_at

ai_caddy_actions  -- audit trail
  id, thread_id, user_id, tool_name, args, result, status, created_at
```

RLS: each user can only see their own threads/messages. `ai_caddy_actions` readable by admins for audit. Service role for the edge function.

**Routing:**
- Single thread URL pattern: `/admin/?caddy=<threadId>` (query param, so it overlays any admin page). Reload restores the open thread.

---

## OpenClaw cleanup (separate, ~5 min)

- Delete `supabase/functions/openclaw-api` and `supabase/functions/openclaw-mcp`
- Remove their blocks from `supabase/config.toml`
- Delete `public/openclaw-api-docs.md`
- Update references in `public/bayside/sim-centre-setup-checklist.html` and `birdies-codebase-audit.html` (remove the OpenClaw section)
- Leave the `OPENCLAW_API_KEY` secret in place for now (harmless, you can delete it from the dashboard if you want)
- Update the project memory entry that references the OpenClaw gateway

---

## What I'd ship in this turn

1. The OpenClaw cleanup (small, isolated).
2. The DB migration for AI Caddy.
3. The `ai-caddy` edge function with the **read-only diagnostic tools** and **2 safe actions** to start: `refund_booking`, `adjust_credit`. Approval-gated.
4. The floating button + sheet + threaded chat UI with AI Elements.
5. Update the project memory with the AI Caddy entry.

**Follow-up turn:** add the remaining safe actions (resend email, toggle flag, re-register SGT, cancel booking, force-close tournament) once you've validated the v1 chat feels right.

---

## Open question (low-stakes, won't block)

The "Diagnose + safe actions" v1 includes `refund_booking` and `adjust_credit` as the most-used. Want me to start with just those two and you can request more, or list all seven up-front?
