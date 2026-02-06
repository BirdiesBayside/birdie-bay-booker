
## What I think happened (most likely)
“Failed to connect to server” on bays 1 & 2 is coming from the Bay Controller UI when this call fails:

- `supabase.functions.invoke("bay-controller-api", ...)` in `src/pages/BayController.tsx` (`fetchBookings()`)

That error is generic; it will show for:
- the backend function being temporarily unavailable (404 / deploy issue),
- network/DNS issues on those PCs,
- CORS/preflight rejection (request blocked before it even reaches the backend),
- timeouts/slow responses.

When that happens at the wrong time (e.g., controller app boot / refresh), automation won’t trigger because the controller may have **no bookings loaded**, even though bookings exist in the system.

### Two important discoveries in the current code that make diagnosis harder
1) **Controller “logging” currently does not log to `bay_controller_logs` at all**
- `useBayControllerLogger` sends `{ logs: [...] }` to `bay-controller-api`
- but the backend only inserts logs when `action === "log"` (query param).
- The client never sets `action=log`, so those requests go through the default “bookings” path and logs are silently ignored.
- Result: we have almost no historical “why did it fail” trail from the bay PCs.

2) **“Heartbeat” is not actually a lightweight heartbeat**
- `sendHeartbeat()` also calls `bay-controller-api` without `action=heartbeat`
- so every 30s it runs the heavier “bookings” logic (bay lookup + upsert + bookings fetch + profile/SGT lookups).
- Under load or transient issues, this increases the chance of timeouts and “Failed to connect” cascades.

## What I need to confirm (so we can be certain)
Because the UI error message is generic, we need to differentiate:
- Was it 404 (backend function not deployed/available)?
- 401/403 (auth/key issue)?
- CORS preflight blocked?
- Timeout/network error?

I’ll implement instrumentation so next time you see that message, we know the exact failure mode instantly.

## Implementation plan (code changes)
### A) Make `bay-controller-api` reliably callable from all clients
**File:** `supabase/functions/bay-controller-api/index.ts`

1) **Upgrade CORS headers to the “full supabase-js compatible” allowlist**
   - Include the standard “x-supabase-client-*” headers (right now they are missing).
   - Return `new Response("ok", { headers: corsHeaders })` for `OPTIONS` (not `null`).

2) **Add explicit deployed version reporting**
   - Add `const VERSION = "..."` and `const DEPLOYED_AT = "..."`.
   - Include `_version` + `_deployed_at` in every success/error response.
   - Log `[VERSION]` prefix in all logs.
   - This prevents “stale deploy” confusion and lets you verify instantly what’s running.

3) **Stop relying on query param only for routing**
   - Allow `action` to be provided via:
     - a header like `x-action`, and/or
     - JSON body `{"action":"log" | "heartbeat" | "bookings"}`
   - Keep query param support for backwards compatibility.

4) **Make “log” inserts work even when action isn’t provided**
   - If payload contains `logs` array, treat it as a log request (even if action missing).
   - This alone will immediately populate `bay_controller_logs` and give us a timeline the next time something breaks.

5) **Make heartbeat truly lightweight**
   - When `action=heartbeat`, only upsert last_seen/version/control_mode and return quickly.
   - Avoid the bookings query entirely.

### B) Fix the Bay Controller client to call the right “actions”
**File:** `src/pages/BayController.tsx`

1) **Fetch bookings with explicit action**
   - Send `action: "bookings"` (header or body) so it’s unambiguous.

2) **Heartbeat with explicit action**
   - Change heartbeat loop to `action: "heartbeat"` (lightweight).
   - This reduces backend load and reduces timeouts.

3) **Improve the UI error details**
   - When `invoke()` fails, surface:
     - HTTP status (if available),
     - error name/code,
     - message,
     - timestamp,
     - last known `_version` from the last successful response.
   - Add a “Copy diagnostics” button so staff can paste the details to you.

4) **(Optional but recommended) Add an “offline fallback”**
   - Cache the last successful bookings payload in `localStorage` with a timestamp.
   - If the controller can’t reach the server temporarily, it can still:
     - display the cached bookings,
     - run plug automation for a short window (e.g., up to 10 minutes),
     - show a clear banner: “Offline mode – using cached data”.

### C) Fix server-side event logging from the bay PCs
**File:** `src/hooks/useBayControllerLogger.ts`

1) Ensure logs are routed to the backend log handler by:
   - sending `action: "log"` OR
   - relying on the backend “payload shape detection” (logs array) from step A4.

2) Add “flush on unload/minimize”
   - When the app is hidden to tray / closed, flush queued logs so we don’t lose the final events.

### D) Add “why didn’t plugs turn on?” debugging breadcrumbs
**File:** `src/pages/BayController.tsx`

1) When automation decides to turn plugs on/off, log a structured event:
   - booking id, booking window, `preStartMinutes`, local PC time, and (if available) server time offset.
2) When a plug control command runs, log:
   - per plug: IP, action, success/error
   - total runtime
This will let you answer questions like “did it try?” vs “did it not decide to?”.

## Operational steps (immediate checks you can do on-site next time)
When you see “Failed to connect to server” on a bay:
1) Check if other bays show it at the same time (suggests backend outage) vs only one PC (suggests local network).
2) On that bay PC, verify Windows clock/timezone is correct (Brisbane). If it’s off by minutes, automation windows can miss.
3) If possible, open the Bay Controller “diagnostics” section (we’ll add it) and copy the exact error status/message.

## How we’ll verify the fix end-to-end
1) On one bay PC, temporarily disconnect internet (or block the backend domain), confirm:
   - UI shows a detailed reason (not just generic toast),
   - offline fallback behavior (if implemented).
2) Reconnect internet, confirm:
   - connection restores and bookings refresh,
   - plugs turn on when within pre-start window.
3) Confirm `bay_controller_logs` starts filling (controller_start, connection_lost/restored, plug_on/off, etc.).
4) Confirm `_version` is returned from the backend so we can prove the bay PCs are hitting the latest deployed backend.

## Why bays 1 & 2 specifically?
Right now, without detailed per-request error codes (and because logs aren’t being stored), I can’t prove whether it was:
- a backend availability/deploy window,
- CORS/preflight rejection affecting only certain runtime conditions,
- local network/DNS issue affecting a specific switch/AP segment,
- or timeouts under load.

The plan above makes the next incident fully attributable within minutes, and it also reduces the chance of it recurring (lightweight heartbeat + better CORS + offline fallback).

## If you want me to continue in a new request
I can proceed to implement the above changes once you approve, then we can do a quick “ping/diagnostics” run from one bay PC to validate.
