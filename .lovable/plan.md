
# Enhanced Bay Controller Diagnostic Logging

## The Problem

Bay 6 launched Protee Labs onto the wrong screen during a cold start (no prior session). The logs show plugs turned on at 16:57 and apps launched at 16:59:50, but there is **zero visibility** into:
- What displays Windows detected at launch time
- Whether the display-availability check passed or was skipped
- Whether Protee Labs was placed on the correct display initially then moved, or started on the wrong one

## What We Need to See

Every time apps launch or close, the logs should capture:
1. **Display enumeration** -- exactly which monitors Windows sees, by label
2. **Display check result** -- did the target display pass the availability check? 
3. **Process verification after close** -- are GSPro/Protee actually dead?
4. **Launch placement** -- which display was targeted, and did the window end up there?

## Plan

### 1. Add `checkProcesses` IPC handler (electron/main.js)

New handler that runs `tasklist` and returns which simulator processes are currently running with their PIDs. This gives the controller a way to verify kills actually worked.

### 2. Update `closeApps` to return real results (electron/main.js)

Currently always returns `{ success: true }`. Change it to:
- Run `taskkill /IM <process> /F` as before
- Then run `tasklist` to verify the processes are actually gone
- Return `{ success: true/false, killed: [...], stillRunning: [...] }`

### 3. Log display enumeration at launch time (electron/main.js)

Inside `runAppLaunchSequence`, before launching each app, call `screen.getAllDisplays()` and include the full display list (labels, bounds, sizes) in the IPC result so the renderer can log it.

### 4. Log display state and process state in BayController.tsx

At every key automation moment, log the actual state:

- **Before app launch**: Log all detected displays (labels and bounds)
- **After app close**: Call `checkProcesses` and log whether GSPro/Protee are still alive
- **Changeover Step 2**: Use the proper `closeApps()` wrapper instead of calling electronAPI directly, then verify processes are dead before proceeding to Step 3
- **Changeover Step 3**: Log display state before relaunching

### 5. Update electron.d.ts types

Add the `checkProcesses` type definition.

### 6. Version bump to 1.0.7

So we can confirm the new build is actually running.

## Technical Details

### New IPC handler: `check-processes`

```text
Input: none
Output: {
  success: boolean,
  processes: [
    { name: "GSPro.exe", pid: 1234 },
    { name: "ProteeLabs.exe", pid: 5678 }
  ]
}
```

Uses `tasklist /FO CSV /NH` filtered for GSPro.exe and ProteeLabs.exe.

### Updated `closeApps` return shape

```text
{
  success: boolean,           // true only if all targeted processes are confirmed dead
  results: [
    { app: "GSPro.exe", killed: true },
    { app: "ProteeLabs.exe", killed: false, stillRunning: true, pid: 5678 }
  ]
}
```

### New log events from BayController.tsx

- `process_detection` -- logged after close, showing which processes are still alive
- `automation_decision` -- enhanced with a `displays` field showing all detected monitor labels at launch time

### Files changed

| File | Change |
|------|--------|
| `electron/main.js` | Add `check-processes` IPC, update `closeApps` to verify kills, add display logging to launch sequence |
| `electron/preload.js` | Expose `checkProcesses` |
| `src/types/electron.d.ts` | Add `checkProcesses` type |
| `src/pages/BayController.tsx` | Log displays before launch, verify processes after close, fix changeover to use proper closeApps wrapper |
| `electron/package.json` | Bump to 1.0.7 |

### What the logs will look like after this

For every session start you will see:
```
[automation_decision] Launching apps - Displays detected: RE6504 (3840x2160), LG ULTRAFINE (3840x2160), LG (1920x1080)
[app_launch] App launched: GSPro (target: RE6504)
[app_launch] App launched: Protee Labs (target: RE6504)
```

For every close:
```
[app_close_scheduled] Closing apps for session end
[process_detection] Post-close verification: GSPro.exe NOT FOUND, ProteeLabs.exe NOT FOUND -- all clear
```

Or if something goes wrong:
```
[process_detection] Post-close verification: GSPro.exe NOT FOUND, ProteeLabs.exe STILL RUNNING (PID 5678) -- KILL FAILED
```

This will definitively answer whether the issue is:
- Display not detected at launch time (timing/hardware)
- Apps not dying properly (close failure) 
- Apps launching correctly but Protee moving itself later (app behavior)
