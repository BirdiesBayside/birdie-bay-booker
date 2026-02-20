

# Enhanced Diagnostic Logging for Display Timing Issues

## The Core Question

Plugs turn on at **T-3 minutes** and apps launch at **T-1 minute**, giving only a **2-minute window** for the RE6504 to fully enumerate. You've measured it can take up to 90 seconds. That leaves as little as 30 seconds of margin -- and if anything delays the plug-on command or the display takes longer on a cold morning, apps could launch before the target screen is ready.

The display guard at launch time calls `getDisplays()` and checks for the configured label. But we currently don't log:
- What labels were actually returned by that check
- Whether the check passed or was skipped
- The exact timestamps of plug-on vs. display detection vs. app launch

## What We Will Add

### 1. Log the display guard result in BayController.tsx

Right now the display check (lines 2435-2469) only logs to the local UI via `addLog()`. We need to send this to the **server logs** via `bayLogger` so it appears in the diagnostic trail. Specifically:

- **Guard PASSED**: Log all detected display labels with a `process_detection` event
- **Guard FAILED**: Log the missing displays AND what was detected, with error level
- **Guard ERROR**: Log the exception

### 2. Log timing gap between plug-on and app launch

Add an `automation_decision` log entry at the moment of app launch that includes:
- How many seconds ago the plugs were turned on (the actual gap)
- The configured `preStartMinutes` and `appLaunchMinutes` values
- Whether this is a cold start (first session of the day) or a changeover

This will show definitively if the 2-minute gap is being respected, or if timing drift is shrinking it.

### 3. Log display enumeration BEFORE the guard check (not just at launch)

Currently the display snapshot is captured inside `runAppLaunchSequence` in electron -- AFTER the guard has already passed. We need to log what `getDisplays()` returned BEFORE the guard decision, so we can see if labels were present but wrong, or if the display was genuinely missing.

### 4. Add a retry/wait mechanism for missing displays (optional but recommended)

Instead of immediately cancelling when a display is missing, retry `getDisplays()` up to 3 times with 10-second gaps. Log each attempt. This handles the case where the display is 5-10 seconds away from being ready.

## Technical Changes

### BayController.tsx -- `launchApps()` function

**Before the display guard check:**
```
Log via bayLogger: "Pre-launch display check starting"
with details: { 
  plugsOnSince: <timestamp when plugs were last turned on>,
  secondsSincePlugOn: <calculated gap>,
  preStartMinutes, 
  appLaunchMinutes,
  isColdStart: <true if no prior session today>
}
```

**Display guard result logging:**
```
If PASSED: bayLogger.sendLog('process_detection', 
  'Display guard PASSED: RE6504, SAMSUNG, LG detected', 
  { details: { detectedLabels: [...], requiredLabels: {...} } })

If FAILED: bayLogger.sendLog('process_detection',
  'Display guard FAILED: RE6504 not detected',
  { level: 'error', details: { detected: [...], missing: [...] } })
```

**Add retry logic for missing displays:**
- If configured display is missing, wait 10 seconds and recheck
- Retry up to 3 times (30 seconds total)
- Log each retry attempt with attempt number and what was detected
- If still missing after retries, cancel launch and log final failure

### BayController.tsx -- Track plug-on timestamp

Add a ref (`lastPlugOnTimeRef`) that records when plugs were last turned on. Use this in the launch logging to calculate the actual plug-on to app-launch gap.

### electron/main.js -- No changes needed

The display snapshot logging added in v1.0.7 already captures displays at launch time inside electron. The new logging is at the BayController level (before the IPC call).

### Files Changed

| File | Change |
|------|--------|
| `src/pages/BayController.tsx` | Add bayLogger calls to display guard, track plug-on timestamp, add display retry logic |

### What The Logs Will Show

For every automated app launch, you will now see this sequence in the server logs:

```
[automation_decision] Pre-launch display check - plugs on 118s ago (cold start), checking for RE6504, SAMSUNG
[process_detection] Display guard attempt 1/3: PASSED - Detected: RE6504 (3840x2160), SAMSUNG (3840x2160), LG (1920x1080)
[automation_decision] App launch display snapshot: RE6504 (3840x2160), SAMSUNG (3840x2160), LG (1920x1080)
[app_launch] App launched: GSPro
[app_launch] App launched: Protee Labs
```

Or if the display is slow:

```
[automation_decision] Pre-launch display check - plugs on 115s ago (cold start), checking for RE6504, SAMSUNG
[process_detection] Display guard attempt 1/3: FAILED - Detected: SAMSUNG (3840x2160), LG (1920x1080) - Missing: RE6504 - retrying in 10s
[process_detection] Display guard attempt 2/3: FAILED - Detected: SAMSUNG (3840x2160), LG (1920x1080) - Missing: RE6504 - retrying in 10s
[process_detection] Display guard attempt 3/3: PASSED - Detected: RE6504 (3840x2160), SAMSUNG (3840x2160), LG (1920x1080)
[automation_decision] App launch display snapshot: RE6504 (3840x2160), SAMSUNG (3840x2160), LG (1920x1080)
```

Or worst case:

```
[process_detection] Display guard attempt 3/3: FAILED - Detected: SAMSUNG, LG - Missing: RE6504 - ALL RETRIES EXHAUSTED, LAUNCH CANCELLED
```

This will definitively answer: was the RE6504 detected when apps launched, and how long after plug-on did the launch actually happen?

