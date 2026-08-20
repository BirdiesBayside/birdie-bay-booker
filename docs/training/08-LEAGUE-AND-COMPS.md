# 08 — League, Comps & Highlights *(optional / advanced)*

Reference: `docs/platform/04-LEAGUE-AND-COMP.md` and `docs/platform/13-SGT-MANAGER-HANDOVER.md`

**Skip this module unless the client actually runs leagues.** It is the most complex and most
venue-specific part of the platform, and most new clients don't need it on day one.

## The three things in here

**1. Online league (SGT).** Players are registered into an external golf-simulator tour service.
Rounds they play at the venue sync back, handicaps are calculated, and leaderboards are published,
including TV screens in the venue.

**2. Local competitions.** In-house weekly two-player Ambrose events with team handicaps, score
entry by staff, prizes and standings.

**3. Highlights.** The bay PC records league rounds, splits them, uploads them, and staff review
and export clips.

## Concepts worth understanding even if you skip the detail

- **Handicap.** A number that levels the field. Here it's provisional until the player has enough
  scored rounds, and players are exempt from winning while provisional.
- **Net vs gross.** Gross is what you shot; net is after handicap. League positions are net.
- **Sync jobs.** Cron jobs run daily to register players, pull scores, recalculate handicaps and
  close tournaments. Most league bugs are a sync ordering problem, not a display problem.
- **Identity matching.** Local accounts are matched to the external service by exact email. A
  mismatch shows up as a player who "disappeared" or scores that don't attach to anyone.

## Rules that must not be broken

- Registration follows a strict order: club, then tour, then tournament. Out of order silently
  fails.
- Manual handicap overrides always beat calculated ones.
- Only completed 18-hole rounds count toward averages and handicaps.
- All tournament timing uses the venue timezone. Weeks start and end on fixed local days.

## Exercise (only if relevant to the client)

With the trainer, trace one player from registering, through playing a round, to appearing on the
leaderboard with a handicap. Name each job that ran along the way.

## Check yourself

- Why does the registration order matter?
- What makes a player "provisional", and what can't they do?
- Why is exact email matching a fragile point?

→ Next: [09 — The Bay Controller](09-BAY-CONTROLLER.md)
