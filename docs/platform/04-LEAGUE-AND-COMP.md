# 04 — League, Competitions and Highlights

Two separate competitions run weekly:

- **Birdies League** — online, via Simulator Golf Tour (SGT). Play any time during the
  tournament window in any bay.
- **Wednesday Ambrose** — in-person 2-man Ambrose team comp, scored manually by staff.

## SGT integration

External service: Simulator Golf Tour. Credentials and club URL live in `sgt_club_config`
(per-project, editable via the gear icon in Admin → SGT Manager,
`SGTSettingsDialog.tsx`). Nine edge functions read this config — none of them hardcode a
club any more. `sgt_api_config` holds API keys (`sgt-refresh-api-key`).

**Registration must follow this exact 3-step order: club → tour → tournament.** Skipping
or reordering silently fails.

Key functions:

| Function | Role |
| --- | --- |
| `sgt-api` | Generic proxy to the SGT API, includes `tournament-stats` |
| `sgt-sync` / `sgt-sync-eligible` | Pull members, scores, tournaments |
| `sgt-register` / `sgt-auto-register` | Register players (6:00am daily) |
| `sgt-daily-tournament-register`, `sgt-tournament-auto-register` | Weekly tournament entry |
| `sgt-cleanup-ineligible` | Monthly removal of lapsed members (4-week grace) |
| `sgt-recalc-handicaps` | Handicap recalculation |
| `sgt-calculate-monthly-standings` | Monthly points |
| `sgt-course-sync`, `sgt-fix-tees`, `sgt-embed-scrape` | Course and data maintenance |

Timing: tournaments start **Sunday** and end **Monday** (Brisbane). Auto-close runs 6:00am
and trims `end_date` to 10 characters. Identity matching against profiles is by **exact
email**; mismatches must be linked manually. Background syncs run every 4 hours.

Membership ↔ SGT lifecycle: a member who lapses for over 4 weeks is removed from the club
on the last day of the month; a member whose subscription becomes active again is
re-added to club, tour and tournament automatically (DB trigger plus a 5:00am Brisbane
fallback sync).

## Handicaps (league)

- New players are **provisional** until they have completed **3 full 18-hole rounds**.
  Provisional players show `(E)` on leaderboards and cannot win.
- After the 3rd round, the system sets a true `custom_hcp` from the best 3 of the last 6
  rounds. `custom_hcp` always overrides any combo/onboarding handicap at registration.
- Only **complete 18-hole gross** rounds count — detection requires 18 distinct hole
  entries, so partial cards cannot deflate a handicap.
- Negative ("plus") handicaps parse correctly.
- Monthly points only start accruing from a player's **4th round**.
- Front-end: `src/hooks/useExemptPlayers.ts`, `LeagueLeaderboard.tsx`,
  `EmbedTVCurrentWeek.tsx`.

## Monthly standings and prizes

- Points use a descending scale (25 down to 1) and require at least one 18-hole score;
  the unit is `pts`.
- Standings are grouped by the tournament `start_date` **calendar month** — no 4-week
  blocks, no "Late" suffix.
- Positions are computed after removing provisional `(E)` players; exempt players earn 0.
- Prizes are approved manually: approving a weekly winner grants $40 credit, closes the
  tournament and recalculates standings (`approve-weekly-prize`, `approve-monthly-prize`).
- Admin reminders fire Monday 9am and the 1st at 10am Brisbane (`send-winner-reminder`).
- Winner sorting uses normalised net to-par (`to_par_net_sum`).

## Ambrose (local comps)

Tables: `local_competitions`, `local_comp_teams`, `local_comp_players`,
`local_comp_saved_teams`, `local_comp_settings`, `local_hcp_adjustments`.
UI: `src/pages/admin/AdminLocalComps.tsx` and `src/components/admin/local-comps/`.

- 2-man teams, combined handicap, split payments handled through Admin POS.
- Leaderboard ties are broken by `position` so ordering is stable.
- **Handicap adjustment (runs when a comp is marked completed):** based on **finishing
  position**, not net scores. Position is spread across the field (1st = −1.5, last = +1.5,
  rounded to 0.5); the middle band (|spread| < 0.45, roughly the middle third) gets no
  change, so blow-out scores can't drag the whole field. A **gross-score check** then adds
  an extra −0.5 for teams whose gross is 3+ better than the field average gross, or −1.0 at
  6+ better (catches teams clearly playing above their handicap). Winners get an extra −0.5,
  back-to-back winners a further −1.5.
- **First-timer flag:** `local_comp_first_timer_flags(competition_id)` marks a pairing's debut
  round (case-insensitive name match, either order). If a debut team's **net** finishes 10+
  strokes better than course par (`sgt_courses.par` via `course_id`, fallback 72) the round is
  flagged and the team is not eligible to win. Surfaced in `ScoreEntry.tsx` ("1st comp" /
  "Review" badges) and `CompLeaderboard.tsx`.
- `HandicapMismatches.tsx` flags players whose Ambrose handicap differs from their league
  handicap by 4+ shots.
- `local-comp-commentary` generates an AI recap per week (Gemini via Lovable AI Gateway),
  shown in `CompCommentaryDialog.tsx`. The league equivalent is
  `sgt-tournament-commentary`.

## Video highlights

Pipeline: Bay Controller records league rounds in OBS → uploads to Cloudflare Stream via
tus → `sgt-highlight-poller` matches the recording to an SGT round and scorecard →
staff review in `AdminHighlightReview.tsx` → published to `LeagueHighlights.tsx`.

Tables: `recording_sessions`, `recording_clips`, `recording_holes`, `highlight_clips`,
`highlight_events`.

Hard-won behaviours:

- `recording_sessions_active_unique` partial unique index prevents duplicate active
  sessions from a poller race.
- Watchdog finalises stuck uploads 30 seconds before session end; an Orphan Reaper cleans
  up abandoned sessions.
- `refreshStreamStatuses` re-checks Cloudflare for `inprogress` sessions and flips them to
  `ready` once encoding completes (otherwise finished videos showed "processing" forever).
- A backfill pass attaches scorecards that arrived after the video; only full 18-hole
  cards (`isFullEighteen()`) are cached to a highlight.
- Highlight filtering queries `recording_sessions` directly rather than trusting a status
  column.
- `delete-recording-session` cascades deletion to Cloudflare, not just the database.
- Mobile "Save to Photos" uses the Web Share API with real `File` objects;
  `clip-download-proxy` exists to defeat mobile CORS.

## TV embeds

Public read-only routes for lounge screens, with permissive read-only RLS:
`/embed/tv-current-week`, `/embed/tv-previous-week`, `/embed/tv-monthly-winner`,
`/embed/tv-local-comp`, plus stats variants. Portrait leaderboards show `Thru X` or `F`.
