# Architecture rules

- Complimentary admin session extensions use `admin_extend_session` for atomic availability checks and end-time updates; retain purchased duration and payment fields to avoid altering billing/credits, and refresh door access after saving. Bay automation and timetable occupancy must derive their end from `end_time`, not purchased duration, so complimentary time is respected without changing billing.

- Local competition teams created from existing players use `teamFromCurrentPlayers` and read player handicaps again before saving; the shared player roster remains the source of truth and must not be reset by team creation.