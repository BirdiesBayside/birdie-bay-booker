# Architecture rules

- Complimentary admin session extensions use `admin_extend_session` for atomic availability checks and end-time updates; retain purchased duration and payment fields to avoid altering billing/credits, and refresh door access after saving. Bay automation must continue deriving shutdown from `end_time`.

- Local competition teams created from existing players use `teamFromCurrentPlayers` and read player handicaps again before saving; the shared player roster remains the source of truth and must not be reset by team creation.