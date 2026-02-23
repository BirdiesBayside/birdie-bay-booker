

# Simpler Fix: Never Allow Plug-Off While Apps Are Running

## The Problem
The current `turnOffPlugs` function detects running apps, tries to kill them, but then **always proceeds to turn off plugs regardless** -- even if the kill failed or new apps spawned in the meantime.

## The Solution
One simple rule enforced at a single point: **the plug-off command will not execute if apps are still running.** Instead of adding complex re-check guards and concurrency locks across multiple code paths, we make `turnOffPlugs` itself the gatekeeper.

## How It Works

**File: `src/pages/BayController.tsx` -- `turnOffPlugs` function (line ~2229)**

The existing code already has a "PRE-PLUG-OFF PROCESS CHECK" at lines 2278-2314 that detects running apps. Currently, if apps are found alive, it force-kills and continues. The change:

1. After the kill attempt and 2-second wait, **re-check** if apps are truly dead
2. If apps are **still running**, **abort the plug-off entirely** and log it
3. Schedule a short retry (e.g., 5 seconds) to attempt the plug-off again
4. Cap retries (e.g., 3 attempts) to avoid infinite loops

This means no matter what triggers `turnOffPlugs` -- Precision Scheduler, auto-mode logic, booking removal, cancellation -- the same safety gate applies. No plug-off command will ever reach the smart plugs while apps are alive.

## Technical Detail

```text
// After the existing kill attempt + 2s wait (around line 2306-2309):

// FINAL SAFETY CHECK: Re-verify apps are truly dead
const gsproFinal = await window.electronAPI.findWindow("GSPro");
const proteeFinal = await window.electronAPI.findWindow("ProTee");
const stillAlive = !!gsproFinal?.hwnd || !!proteeFinal?.hwnd;

if (stillAlive) {
  console.error('[turnOffPlugs] BLOCKED: Apps still running after kill attempt. Aborting plug-off.');
  addLog('Plug-off BLOCKED: apps still running, will retry in 5s', 'error');
  bayLogger.sendLog('automation_decision', 'PLUG-OFF BLOCKED: apps still alive after kill', {
    level: 'error', immediate: true
  });

  // Retry after 5 seconds (up to 3 attempts)
  if (retryCount < 3) {
    setTimeout(() => turnOffPlugs(isManual, showToast, retryCount + 1), 5000);
  }
  return; // DO NOT proceed to plug-off
}

// Only reaches here if apps are confirmed dead -- safe to cut power
```

The function signature gains an optional `retryCount` parameter (default 0) to track retry attempts.

## What This Covers

- Late-booked extensions (the Bay 6 scenario) -- new apps spawn, plug-off is blocked
- Slow app shutdown -- kill takes longer than expected, plug-off waits
- Any future edge case -- the rule is universal: no apps running = safe to cut power

## What This Does NOT Change

- Manual override plug-off (already skips the app check with `isManual`)
- App launch/close logic (unchanged)
- Precision Scheduler timing (unchanged, it still fires, but `turnOffPlugs` blocks itself)
- No new refs, no new locks, no changes to multiple code paths

