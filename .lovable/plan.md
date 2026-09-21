# Sim Cup: Teams of Two + Handicaps

Build two-player teams into the Sim Cup admin board, pull handicaps from the league where possible, allow manual entry, and include it all in the CSV export.

## How it will work

**Teams**
- Each timeslot holds 6 players = 3 teams of two.
- Teams are numbered across the whole day: Team 1–3 in the 8-11am slot, Team 4–6 in 11am-2pm, Team 7–9 in 2-5pm. Each team also gets an optional team name.
- On each player card in the Timeslot Board there's a "Team" dropdown listing only the teams belonging to that player's slot, plus "No team".
- Changing a player's slot clears their team, so nobody ends up in a team from another slot.
- Each slot shows its three teams grouped together with the team name editable inline, a warning badge when a team has fewer or more than 2 players, and the team's combined handicap.

**Handicaps**
- A "Pull handicaps from league" button matches each registrant by email against league members and fills in their handicap (an admin-set custom handicap wins over the synced one, matching how the league already works elsewhere).
- Anyone without a league match stays blank and can be typed in manually on their card; manual values are flagged so a later pull doesn't overwrite them.
- Each player card shows the handicap and whether it came from the league or was entered by hand.

**CSV export**
- Adds columns: Team Number, Team Name, Handicap, Handicap Source — alongside the existing name, email, phone, shirt, slot and payment columns. Rows export sorted by slot then team.

## Technical notes

- Migration on `sim_cup_registrations`: `team_number` (int, nullable), `team_name` (text, nullable), `handicap` (numeric, nullable), `handicap_source` (text, nullable: `league` | `manual`).
- Handicap lookup: client query joining `sgt_members` (email, case-insensitive) to `sgt_tour_members`, taking `custom_hcp` when set, otherwise `hcp_index`. Scoped to the current active tour using the existing active-tour selection logic.
- All edits go through the existing optimistic `patchReg` helper in `SimCupTab` (src/pages/admin/AdminMarketing.tsx); team name edits write to every member of that team.
- Team constants: `TEAMS_PER_SLOT = 3`, team numbers derived from slot index so numbering stays stable.
- `exportCsv` extended with the four new columns and the slot/team sort.
