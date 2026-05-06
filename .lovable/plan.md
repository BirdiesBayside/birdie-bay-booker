## Problem

The Winner's Tax adjustment system **is working correctly** — the database shows:
- Bailey Cathro: 9 → 7 → 3 (won twice, −2 then −4)
- Joel Critchell: 30 → 28 → 24 (won twice, −2 then −4)
- Mick O'Connor: 24 → 26 (last place +2)
- Caris Corfius: 36 → 38 (last place +2)

So `local_comp_saved_teams.player1_local_hcp` / `player2_local_hcp` are being updated each week.

**But the comp results table shows the wrong handicaps** because of two bugs in `ScoreEntry.tsx`:

### Bug 1 — "Load Previous Team" picker pulls stale data
The saved-teams query (lines 38–73) merges results from `local_comp_saved_teams` AND from past `local_comp_teams` (raw entries). When the same team exists in both sources, the dedupe keeps **whichever appears first**, but the past comp entries contain the original base handicaps from previous weeks, not the updated local hcp.

Result: if a team appears in both lists, the picker often loads the old static handicap from a past entry instead of the updated `local_hcp` from saved teams.

### Bug 2 — Picker uses `player1_handicap` field as the loaded value
Even when it does pick from `saved` (line 64–66), it normalizes `player1_local_hcp ?? player1_handicap`. That part is fine. But the field shown in the dropdown subtitle (line 320) shows `t.player1_handicap` which is the normalized local-hcp — that's actually OK.

The real failure is Bug 1: past comp entries are mixed in and win the dedupe, so old base handicaps get loaded. Looking at Week 2 results:
- Bailey Cathro shown as **7** (his post-Week-1 local hcp ✓ — coincidence: matched saved teams)
- Joel Critchell shown as **28** (his post-Week-1 local hcp ✓)
- But "Tree Dweller's" Jarrod Milloy & Reece Taylor still **23/23** — they were never adjusted, fine
- Karl Robinson **20** vs Brodie Robinson **36** — Brodie's saved record shows local_hcp 20, but past comp had 20, so loaded 20... but in Week 2 he shows 36? That's the *base* hcp, meaning the saved-team picker pulled from past comp entries OR the team was entered manually.

Either way, the picker behaviour is unreliable and admin has no visual indicator showing whether the loaded handicap is the latest adjusted local HCP.

## Fix

### 1. Saved teams picker — only use `local_comp_saved_teams`
Drop the merge with `local_comp_teams`. The saved teams table is the source of truth for current handicaps. If a team isn't saved yet, admin can save it once and it will track adjustments going forward.

### 2. Show "Local HCP" badge in the picker
Update each row in the picker dropdown to display:
> Bailey Cathro (Local HCP **3.0**, base 9) & Joel Critchell (Local HCP **24.0**, base 30)

So the admin can see at a glance the adjusted handicap being loaded.

### 3. Auto-refresh local_comp_saved_teams query when comp completes
Invalidate the `saved-local-comp-teams` query key whenever a competition's status flips to `completed` (the trigger updates handicaps). Done via realtime subscription on `local_comp_saved_teams`.

### 4. Add a "Refresh Handicaps from Saved Teams" button on the Score Entry table
For comps that were created before adjustments ran, allow admin to one-click re-pull the current local HCP from `local_comp_saved_teams` for every registered team in the active comp, recompute combined_handicap and net_score. This fixes already-entered teams without re-registering.

### 5. Visual indicator in the Score Entry table HCP column
Show a small "↓2" or "↑2" delta badge next to the team handicap if it differs from the saved team's current local HCP, so admins notice mismatches.

## Files to change
- `src/components/admin/local-comps/ScoreEntry.tsx` — fix picker query, add HCP labels, add refresh button + mutation, add delta indicator
- No DB changes needed (trigger already works correctly)

## Out of scope
- Historical results (Week 1, Week 2) will not be retroactively rewritten — they show what was actually played with at the time. Going forward, registrations will use the current local HCP.
