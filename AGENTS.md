# Architecture rules

- Local competition teams created from existing players use `teamFromCurrentPlayers` and read player handicaps again before saving; the shared player roster remains the source of truth and must not be reset by team creation.