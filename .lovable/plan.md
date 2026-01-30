
# Bay 3 Auto-Launch Issue: Root Cause Analysis and Fix

## Problem Summary
Bay 3 is auto-launching apps and showing "Hi Guest" even though there's no active booking at the current time (13:29, with next booking at 14:30).

## Root Cause Analysis

After investigating the bay controller code, I found **two issues**:

### Issue 1: Manual Mode Not Respected for App Launches
The app auto-launch logic (around line 2198-2266 in `BayController.tsx`) does NOT check the `manualOverride` state before launching apps.

The plug control correctly respects manual mode:
```javascript
if (!manualOverride) {
  if (shouldBeOn) turnOnPlugs();
}
```

But the app launch logic is missing this check:
```javascript
if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
  launchApps();  // Missing: && !manualOverride
}
```

Bay 3 is currently in **manual mode** (`control_mode: manual` in database), so apps should not auto-launch.

### Issue 2: "Guest" Fallback When No Active Booking
The welcome screen shows "Hi Guest" because when apps launch without an active booking detected, the fallback is:
```javascript
firstName: activeBooking?.customer_name?.split(' ')[0] || 'Guest'
```

Since there's no active booking at 13:29 (first booking is at 14:30), `activeBooking` is null, so it shows "Guest".

## Current State
- **Bay 3 Mode**: Manual
- **Current Time**: 13:29 Brisbane
- **Next Booking**: 14:30-16:30 (Zander De Lange)
- **Expected Behavior**: No apps should launch until 14:29 (1 minute before booking), and even then, should respect manual mode
- **Actual Behavior**: Apps are launching and showing "Hi Guest"

## Solution

### Fix 1: Add Manual Override Check to App Launch Logic
Update the auto-launch effect to skip launching when in manual mode:

```javascript
// Don't auto-launch if in manual mode or changeover is in progress
if (manualOverride || changeoverInProgressRef.current) {
  return;
}

if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
  launchApps();
}
```

### Fix 2: Also Add Manual Override Check to App Close Logic
The fallback close logic should also respect manual mode to prevent unexpected closures:

```javascript
if (shouldCloseApps && appsRunning && !manualOverride) {
  closeApps('scheduled');
} else if (!shouldLaunchApps && !shouldCloseApps && appsRunning && !manualOverride) {
  closeApps('scheduled');
}
```

---

## Technical Details

### Files to Modify
1. **`src/pages/BayController.tsx`** - Add `manualOverride` check to the app auto-launch effect (lines ~2198-2266)

### Code Changes

**Before (lines 2251-2265):**
```typescript
// Don't auto-launch if changeover is in progress (it handles the relaunch)
if (changeoverInProgressRef.current) {
  return;
}

if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
  launchApps();
} else if (shouldCloseApps && appsRunning) {
  closeApps();
} else if (!shouldLaunchApps && !shouldCloseApps && appsRunning) {
  closeApps();
}
```

**After:**
```typescript
// Don't auto-launch/close if in manual mode or changeover is in progress
if (manualOverride || changeoverInProgressRef.current) {
  return;
}

if (shouldLaunchApps && !appsRunning && !isLaunchingApps) {
  launchApps();
} else if (shouldCloseApps && appsRunning) {
  closeApps('scheduled');
} else if (!shouldLaunchApps && !shouldCloseApps && appsRunning) {
  closeApps('scheduled');
}
```

Also update the effect dependencies to include `manualOverride` (line 2266).

---

## No App Rebuild Required
This is a JavaScript/React change that is loaded from the web server. Once deployed, all bay controllers running v1.0.4 will receive the fix automatically without needing a new .exe build.

## Testing Recommendation
After the fix is deployed:
1. Switch Bay 3 back to AUTO mode from the admin panel
2. Verify apps only launch at the correct time (1 minute before booking)
3. Test switching to MANUAL mode - apps should not auto-launch or auto-close
