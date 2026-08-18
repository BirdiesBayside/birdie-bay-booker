# 13 — SGT Manager Handover (full build package)

Give this file to any remixed project that needs the Birdies League / SGT Manager stack.
It is the complete inventory: schema, edge functions, cron, triggers, UI, and every rule
that is *behaviour* rather than code. Read it alongside `04-LEAGUE-AND-COMP.md` (concepts)
and `06-INTEGRATIONS.md` (secrets).

---

## 1. What SGT Manager is

Admin → SGT Manager (`src/pages/admin/AdminSGTManager.tsx`) is the control room for the
weekly online league run on **Simulator Golf Tour (SGT)**, an external service. The venue
owns a *club*, inside which we create a *tour*, inside which each week is a *tournament*.
Players play their round in any bay, GSPro posts the score to SGT, and we pull it back.

Six tabs: **Dashboard · Pending Onboarding · Members · Tournaments · Winners · Highlights**,
plus a gear icon opening `SGTSettingsDialog` (club credentials, per-project).

---

## 2. Hard rules (do not "optimise" these away)

1. **Registration order is club → tour → tournament, always.** Out of order fails silently.
2. **Identity matching is by exact email.** Anything else must be linked manually.
3. `sgt_user_id` has a **unique index** — one SGT account can never attach to two profiles
   (this fixed a real username collision incident).
4. **Only complete 18-hole gross rounds count** — detection is 18 *distinct* hole entries
   (`sgt_is_full_18`). Partial cards must never touch handicaps, stats or standings.
5. `custom_hcp` **always** overrides any combo/onboarding handicap at registration time.
6. All timing is **Australia/Brisbane** (no DST). Cron entries below are stored in UTC.
7. Auto-close trims `end_date` to 10 characters before comparison — SGT returns mixed
   date formats.
8. Negative ("plus") handicaps must parse — do not `Math.abs()` anywhere.

---

## 3. Database

### Tables
| Table | Purpose |
| --- | --- |
| `sgt_club_config` | Club URL + `sgt_username` / `sgt_password`. Per project. Never hardcode a club. |
| `sgt_api_config` | API key + expiry, refreshed daily by `sgt-refresh-api-key` |
| `sgt_members` | Everyone known to the club, with `sgt_user_id`, handicap, `custom_hcp` |
| `sgt_tour_members` | Tour enrolment + **`nickname`** (Birdies-facing display name) |
| `sgt_tours`, `sgt_tour_settings`, `sgt_tour_standings` | Tour definitions and season standings |
| `sgt_tournaments` | Weekly events (start Sunday, end Monday) |
| `sgt_scorecards` | Per-hole scores pulled from SGT |
| `sgt_handicap_settings` | Handicap engine knobs (rounds required, best-of window) |
| `sgt_monthly_standings`, `sgt_monthly_awards` | Calendar-month points + winners |
| `sgt_weekly_prizes` | Weekly winner approvals and credit grants |
| `sgt_courses` | Course manifest incl. `par` (2,500+ rows after daily sync) |
| `sgt_notification_settings` | Which league emails fire |
| `profiles.sgt_user_id`, `profiles.sgt_onboarding_dismissed_at/_by` | Link + pending-queue dismissal |

Local comps (Ambrose) use `local_competitions`, `local_comp_teams`, `local_comp_players`,
`local_comp_saved_teams`, `local_comp_settings`, `local_hcp_adjustments`.

Every table: RLS enabled, GRANTs to the roles its policies allow. TV embed tables carry a
permissive **read-only** public policy so lounge screens work signed-out.

### DB functions / triggers
| Object | Role |
| --- | --- |
| `sgt_is_full_18(...)` | The single source of truth for "did they finish 18?" |
| `sgt_player_round_counts` | Completed-round counts per player |
| `sgt_week_round_history(p_tournament_id)` | Rounds a player had **before** this week — drives the exempt rule |
| `local_comp_first_timer_flags(p_competition_id)` | Debut-pairing detection + net-vs-par flag |
| `apply_local_comp_winners_tax` | Ambrose position-based handicap adjustment on completion |
| `trigger_sgt_sync_on_membership_activation` | Membership goes active → re-add to club/tour/tournament |
| `trigger_sgt_auto_register_on_tour_member` | New tour member → register for the live tournament |
| `sync_staff_sgt_exempt` | Keeps staff accounts out of prize eligibility |

---

## 4. Edge functions

| Function | Role |
| --- | --- |
| `sgt-api` | Generic authenticated proxy to SGT, incl. `tournament-stats` |
| `sgt-refresh-api-key` | Daily key refresh |
| `sgt-sync` | Members / scores / tournaments pull (every 4h) |
| `sgt-sync-eligible` | Daily reconcile of who *should* be in the club |
| `sgt-register`, `sgt-auto-register` | Player registration (club→tour→tournament) |
| `sgt-daily-tournament-register`, `sgt-tournament-auto-register` | Weekly tournament entry |
| `sgt-cleanup-ineligible` | Monthly removal of lapsed members (4-week grace) |
| `sgt-recalc-handicaps` | Weekly handicap recalculation (18-hole rounds only) |
| `sgt-calculate-monthly-standings` | Calendar-month points |
| `sgt-member-management`, `sgt-delete-registrations` | Remove from club / clean registrations |
| `sgt-course-sync`, `sgt-fix-tees`, `sgt-embed-scrape` | Course + live-leaderboard data |
| `sgt-tournament-commentary` | AI weekly recap (Gemini via Lovable AI Gateway) |
| `sgt-highlight-poller`, `sgt-highlight-tagger`, `league-highlights-signed-url` | Video pipeline |
| `send-league-winner-email`, `send-winner-reminder`, `approve-weekly-prize`, `approve-monthly-prize` | Prizes |
| `local-comp-commentary`, `ingest-comp-scorecard`, `parse-comp-scorecard` | Ambrose recap + GSPro screenshot OCR |

All use `npm:` imports, native `Deno.serve`, full CORS on every response including OPTIONS,
and `SUPABASE_SERVICE_ROLE_KEY` for admin paths.

---

## 5. Cron (UTC in `cron.job`; Brisbane = +10)

| Job | UTC | Brisbane |
| --- | --- | --- |
| `sgt-refresh-api-key-daily` | `0 18 * * *` | 04:00 daily |
| `sgt-sync-eligible-daily` | `0 19 * * *` | 05:00 daily |
| `sgt-sync-regular` | `0 */4 * * *` | every 4 hours |
| `sgt-course-sync-daily` | `0 20 * * *` | 06:00 daily |
| `sgt-tournament-auto-register-daily` | `0 20 * * *` | 06:00 daily |
| `sgt-recalc-handicaps-weekly` | `0 20 * * 0` | Mon 06:00 |
| `sgt-cleanup-ineligible-monthly` | `0 17 1 * *` | 1st, 03:00 |
| `weekly-winner-reminder` | `0 23 * * 0` | Mon 09:00 |
| `monthly-winner-reminder` | `0 0 1 * *` | 1st, 10:00 |
| `sgt-highlight-poller-1min` / `sgt-highlight-tagger-hourly` | `* * * * *` / `15 * * * *` | video pipeline |

---

## 6. Handicaps and onboarding (the recent work — read carefully)

**Provisional / exempt model**
- A new player is **provisional** until they have completed **3 full 18-hole rounds**.
- Provisional players **play normally but cannot win** — they show `(E)` on every
  leaderboard (Hub, website embeds, TV boards).
- Exemption is evaluated **per week**, from rounds completed *before that week started*
  (`sgt_week_round_history` → `src/hooks/useExemptPlayers.ts`, `TRUE_HCP_ROUNDS = 3`).
- After the 3rd round the system sets a true handicap from the **best 3 of the last 6**
  rounds. **Monthly points start accruing from the 4th round.**
- Onboarding copy in `SGTPendingOnboarding.tsx` must match this wording exactly — weeks 1
  and 2 are exempt, points from round 4.

**Manual handicap edits**
- Editing `custom_hcp` in Members **immediately de-registers and re-registers** the player
  for the live tour/tournament so SGT holds the new number (`sgt-auto-register` +
  `SGTLeagueMembers.tsx`). Without this the old handicap silently persists all week.
- The welcome/onboarding email is **held** until an admin sets `custom_hcp` — never send a
  "Combo (auto)" handicap email to someone still sitting in the pending queue.

**Members tab — 3-dot menu** (`SGTLeagueMembers.tsx`): Edit Handicap · Remove from Club ·
Nickname. Nicknames live on `sgt_tour_members.nickname` and must render everywhere:
`LeagueLeaderboard.tsx`, `EmbedLeaderboard.tsx`, `EmbedCompete.tsx`,
`TournamentStatsView.tsx`, `EmbedTVStatsBase.tsx` (hook: `useSgtNicknames.ts`).

**Pending Onboarding tab**: admins can **dismiss** a pending player
(`profiles.sgt_onboarding_dismissed_at/_by`) so they stop reappearing.

**Membership ↔ SGT lifecycle**
- Lapsed for **over 4 weeks** → removed from the club on the monthly sweep.
- Membership becomes **active again** → automatically re-added to club, tour and
  tournament (DB trigger, with the 05:00 Brisbane sync as a fallback).
- A **returning** player keeps their last-known handicap and skips the Pending queue.

---

## 7. Standings, prizes, winners

- Descending scale **25 → 1**, unit `pts`, requires at least one 18-hole score.
- Grouped by tournament `start_date` **calendar month** — no 4-week blocks, no "Late" suffix.
- Positions computed **after** removing exempt `(E)` players; exempt players score 0.
- Winner sorting uses normalised net to-par (`to_par_net_sum`).
- Prizes are **manually approved**. Approving a weekly winner grants credit, closes the
  tournament and recalculates standings.
- Unclosed tournaments become visible on Monday once `end_date <= today`.

---

## 8. Front-end inventory

```
src/pages/admin/AdminSGTManager.tsx
src/components/admin/sgt/            SGTDashboard, SGTPendingOnboarding, SGTLeagueMembers,
                                     SGTMembers, SGTTournaments, SGTWinners, SGTTours,
                                     SGTRegistrations, SGTScorecards, SGTSettingsDialog,
                                     CourseSelector, TourFormDialog, TournamentFormDialog,
                                     TournamentStatsDialog, TournamentScorecardsDialog,
                                     TournamentCommentaryDialog
src/components/admin/LeagueHighlights.tsx
src/pages/LeagueHub|LeagueLeaderboard|LeagueRounds|LeagueProfile|LeagueRegister.tsx
src/pages/Embed*.tsx                 public + TV boards
src/hooks/                           useExemptPlayers, useSgtNicknames, useActiveTourData,
                                     usePlayerScorecards, useSGTEmbedData
src/lib/sgt-api.ts, src/lib/league-block.ts, src/lib/brisbane-time.ts
```

---

## 9. Porting checklist for the remixed project

1. Copy `src/pages/admin/AdminSGTManager.tsx`, `src/components/admin/sgt/**`, the league
   pages/embeds, the hooks and `src/lib/sgt-api.ts`.
2. Copy every `sgt-*` and `local-comp-*` edge function folder.
3. Recreate the schema in section 3 — **CREATE TABLE → GRANT → ENABLE RLS → POLICY**, in
   that order, for every table. Include the `sgt_user_id` unique index.
4. Recreate the DB functions/triggers in section 3.
5. Add secrets for the new venue: SGT club username/password (into `sgt_club_config` via
   the gear icon, not code), Lovable AI Gateway for commentary, Cloudflare Stream for
   highlights.
6. Recreate the cron jobs in section 5, **converted to the client's timezone** — if the
   venue observes DST, this is a blocking item, not a polish item.
7. Create the club → tour → first tournament in that order before registering anybody.
8. Smoke test: register one player → play an 18-hole round → confirm the scorecard syncs,
   the player shows `(E)`, and after 3 rounds a true handicap is written and points start
   on round 4.

## 10. Known traps

- Chasing "missing" players is almost always exact-email mismatch, not a sync bug.
- A course showing par 72 that isn't means `sgt_courses` is stale — run `sgt-course-sync`.
- PostgREST caps at 1,000 rows: all admin league queries must use `.range()` chunking.
- Don't trust status columns for highlights — query `recording_sessions` directly.
- Abandoned partial cards stay "in progress" on the SGT embed forever; the week-complete
  guard (two full 18-hole cards) is what stops them re-triggering recordings.
