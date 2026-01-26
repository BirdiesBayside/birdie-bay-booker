

# Bay Controller Centralized Logging

## Overview
Add centralized logging for all bay controller applications, allowing admins to view real-time activity and historical events from each bay directly in the admin panel.

## What You'll Be Able to See
- App launches (GSPro, Protee Labs) with timestamps
- App closures (whether automated or unexpected)
- Smart plug control events (on/off)
- Booking session starts and ends
- Errors and warnings
- Manual override actions
- Window position corrections (F10)
- Customer notifications shown

---

## Implementation Steps

### Step 1: Create the Database Table

Create a new `bay_controller_logs` table to store all events:

```text
┌─────────────────────────────────────────────────────────────┐
│                    bay_controller_logs                       │
├─────────────────────────────────────────────────────────────┤
│ id            │ uuid (primary key)                          │
│ bay_number    │ integer (1-6)                               │
│ event_type    │ text (app_launch, app_close, plug_control,  │
│               │       booking_start, error, etc.)           │
│ event_level   │ text (info, warning, error)                 │
│ message       │ text (human-readable description)           │
│ details       │ jsonb (additional context data)             │
│ booking_id    │ uuid (optional - link to active booking)    │
│ app_version   │ text (controller version)                   │
│ created_at    │ timestamp                                   │
└─────────────────────────────────────────────────────────────┘
```

### Step 2: Add Logging Endpoint to bay-controller-api

Add a new action `log` to the existing edge function:

- Accepts log entries from bay controller apps
- Validates bay number and event data
- Stores in the new table
- Optionally supports batch logging (multiple events at once)

### Step 3: Update Bay Controller App

Modify `BayController.tsx` to send logs to the backend:

1. Create a `sendLog()` function that calls the edge function
2. Hook into key events:
   - `launchApps()` → log "app_launch" for GSPro and Protee Labs
   - `closeApps()` → log "app_close" with reason (automated/manual)
   - Plug control actions → log "plug_on" / "plug_off"
   - Booking activation → log "booking_start"
   - Errors → log "error" with stack trace
   - GSPro closure detection (via `onGsproClosed`) → log "app_close" with "unexpected" flag

3. Add batch/offline support:
   - Queue logs locally if network unavailable
   - Send queued logs on reconnection

### Step 4: Add Admin Panel View

Create a new section in the admin panel (or add to existing Bay Control page):

- Filter by bay number, date range, event type
- Color-coded by severity (info/warning/error)
- Expandable rows to show full details
- Real-time updates via Supabase Realtime
- Export to CSV option

---

## Technical Details

### Event Types to Log

| Event Type | When Logged | Severity |
|------------|-------------|----------|
| `app_launch` | GSPro or Protee Labs launched | info |
| `app_close_scheduled` | Apps closed by automation (end of booking) | info |
| `app_close_manual` | Apps closed via admin action | info |
| `app_close_unexpected` | GSPro/Protee closed without automation trigger | warning |
| `plug_on` | Smart plug turned on | info |
| `plug_off` | Smart plug turned off | info |
| `booking_active` | Booking session became active | info |
| `booking_ended` | Booking session ended | info |
| `window_fixed` | F10 window position correction | info |
| `notification_shown` | Customer notification displayed | info |
| `manual_override_start` | Manual mode activated | warning |
| `manual_override_end` | Auto mode resumed | info |
| `error` | Any error encountered | error |
| `controller_start` | Bay controller app started | info |
| `connection_lost` | Lost connection to backend | warning |
| `connection_restored` | Reconnected to backend | info |

### Log Retention

- Keep logs for 30 days by default
- Add a scheduled cleanup function or use Supabase's pg_cron

### Security

- RLS policies: Only admins can view logs
- Service role can insert (for edge function)
- No user-facing access needed

---

## Files to Create/Modify

### New Files
- Database migration for `bay_controller_logs` table

### Modified Files
1. `supabase/functions/bay-controller-api/index.ts` - Add `log` action
2. `src/pages/BayController.tsx` - Add logging calls to key functions
3. `src/pages/admin/AdminBayControl.tsx` - Add logs viewer panel

---

## Example Log Entry

For Justin's session where GSPro closed unexpectedly, you would see:

```text
Bay 4 | 2:15 PM | info    | Booking activated: Justin Smith (2:00-4:00 PM)
Bay 4 | 2:15 PM | info    | Plug ON: Monitor
Bay 4 | 2:15 PM | info    | Plug ON: Projector  
Bay 4 | 2:16 PM | info    | App launched: GSPro
Bay 4 | 2:16 PM | info    | App launched: Protee Labs
Bay 4 | 2:45 PM | warning | App closed unexpectedly: GSPro (no automation trigger)
```

This would immediately show that GSPro closed without the bay controller initiating it, suggesting either a crash, user action, or external cause.

