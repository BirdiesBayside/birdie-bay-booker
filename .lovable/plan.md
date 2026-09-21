# Fix the slow Hub / website loading

## Diagnosis (confirmed)

- Signed-in sessions stall on the orange "B" loader for ~30–60s because a hung request (payment-method lookup) blocks page setup until timeouts fire. The old code had no loading timeouts, so a weak connection or stale page file meant an indefinite spin.
- Backend is healthy — not a database or server outage.

## What to do

1. **Publish** the recovery changes already built and type-checked:
   - Hub page loader gives up after 8 seconds, reloads once, then shows a "Try again" button instead of spinning forever.
   - Sign-in and dashboard loading each get the same 8-second cap so nothing can hang indefinitely.
2. **You verify** on both cellular and wifi: hard-refresh the Hub (Ctrl/Cmd+Shift+R) once after publish, then confirm /booking loads in a few seconds.
3. If any page still crawls after publish, I'll check for a stale service-worker cache on your device as the next step.

## Technical details

- `src/App.tsx` — PageLoader: 8s timeout, one auto-reload (guarded against loops), then "Try again".
- `src/hooks/useAuth.tsx` — 8s cap on session recovery.
- `src/pages/Dashboard.tsx` — 8s cap on account-access loading.
- No changes to what data loads or who can see what — purely a "stop waiting forever" safety net.
