---
name: Membership Benefit campaign
description: Daily automated email to visitors with 2-5 bookings/8wk showing their membership maths; template editable in Notifications, shared header/footer
type: feature
---

Automated "Membership Benefit" campaign (edge function `membership-benefit-campaign`, cron `membership-benefit-campaign-daily` at 5am UTC = 3pm Brisbane).

Rules:
- Targets visitors with 2–5 confirmed bookings in the trailing 56 days; heavy users (6+) are excluded — most profitable as visitors.
- Past members (any membership_changes row), marketing_opt_out, and suppressed emails excluded. 60-day re-email guard via `membership_campaign_sends`.
- Personalised tags: {first_name} {booking_count} {hours} {visitor_spend} {member_cost} {savings} {savings_line}. Birdie maths: $27/wk + $10/hr.
- HARD RULE: only sends when real savings > 0 (member_cost < visitor_spend) — never email showing membership more expensive than what they paid. savings_line always "You'd have saved $X".

Template: lives in `email_templates` (template_key `membership_benefit`) — editable in Admin → Settings → Notifications as BODY ONLY; shared header/footer from `email_layout` applied at send via `_shared/email-wrapper.ts` (buildEmailTemplate/fetchEmailLayout), unsubscribe link injected inside the green footer like send-marketing-email. The old `marketing_templates` copy was deleted.

Admin UI: stats-only card in Marketing → Templates tab (eligible now, sent, conversion %) in AdminMarketing.tsx; no editor there.
