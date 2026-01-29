

# Plan: Support External SGT Members (like jlag)

This plan enables admins to manage SGT members who don't have Birdies Hub accounts - setting their cleanup exemption status and custom handicaps directly from the admin panel.

---

## Current Situation

- **jlag** has been added to the Birdies SGT Club externally
- They don't appear in the database yet because the 4-hourly sync hasn't run
- Once synced, they would be **immediately removed** by the cleanup logic (no Birdies account = no membership tier = removed from club)
- **Daryl_C** works because he has `exempt_from_cleanup = true` set directly in the database

---

## What We'll Build

### 1. Trigger Sync to Import jlag
Before making UI changes, run a manual sync so jlag appears in the `sgt_members` table.

### 2. Add Exemption Toggle in Members Tab
Update the **SGT Members** component to allow admins to mark members as exempt from cleanup:
- Add an "Exempt" badge for members with `exempt_from_cleanup = true`
- Add a dropdown menu option to **Toggle Exemption** status
- Shows clear visual indicator of which members are protected

### 3. Direct Handicap Management for Non-Hub Members
Update the **SGT Members** component to support setting custom handicaps for members who aren't linked to Birdies accounts:
- Add a "Set HCP" action in the dropdown menu for unlinked members
- When a handicap is set, automatically add them to active tours (like onboarding)
- This bypasses the normal pending → onboard flow since they don't have a profile

### 4. Update SGT Registrations to Handle Exempt Members
Adjust the **SGT Registrations** "Onboarded Members" list to also show exempt external members who have handicaps set.

---

## Technical Changes

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/admin/sgt/SGTMembers.tsx` | Add exemption toggle, add HCP management for unlinked members |
| `supabase/functions/sgt-sync/index.ts` | No changes needed - already respects `exempt_from_cleanup` |

### Database
No schema changes required - `exempt_from_cleanup` column already exists on `sgt_members`.

---

## Workflow After Implementation

1. **Add jlag to SGT club** ✅ (already done)
2. **Trigger manual sync** → jlag appears in Members tab
3. **Toggle exemption** → Mark jlag as exempt from cleanup
4. **Set custom HCP** → Enter their handicap (e.g., 12.0)
5. **Auto-added to tours** → jlag is now registered for all active tours and tournaments

---

## UI Mockup

**Members Tab - New Badge & Actions:**
```text
┌─────────────────────────────────────────────────────────────────────────┐
│ SGT Name      │ SGT Email           │ Status  │ Linked   │ Actions     │
├─────────────────────────────────────────────────────────────────────────┤
│ Daryl_C       │ djcole@...          │ Active  │ Not linked │ ⋮ ▼       │
│ [Exempt]      │                     │         │ [Exempt]   │           │
├─────────────────────────────────────────────────────────────────────────┤
│ jlag          │ jlag@...            │ Active  │ Not linked │ ⋮ ▼       │
│               │                     │         │            │  Set HCP   │
│               │                     │         │            │  Exempt ✓  │
│               │                     │         │            │  ───────── │
│               │                     │         │            │  Deactivate│
│               │                     │         │            │  Delete    │
└─────────────────────────────────────────────────────────────────────────┘
```

