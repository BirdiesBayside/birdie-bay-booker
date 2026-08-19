# 04 — Universal Session API

The single integration surface. Any booking platform (Skedda, Acuity, Square, Bookeo, a
custom system, or a Zapier/Make step) pushes sessions to us. We never poll them in v1.

Base: `https://<project>.functions.supabase.co/sessions-api/v1`

## Auth

```
Authorization: Bearer bcp_live_<key>
Content-Type: application/json
```

Keys are venue-scoped, stored hashed, revocable, rate-limited per key. The venue creates
them in the dashboard and sees the full value exactly once.

## Endpoints

```text
GET    /v1/bays                 list bay_refs for the venue
POST   /v1/sessions             create or update (upsert on external_ref)
PATCH  /v1/sessions/{ref}       reschedule / extend / edit player
DELETE /v1/sessions/{ref}       cancel
POST   /v1/sessions/bulk        replace-or-merge a day's schedule
GET    /v1/sessions?from=&to=   read back what we hold
```

## Create / upsert

`POST /v1/sessions`

```json
{
  "external_ref": "acuity-88213",
  "bay_ref": "bay-1",
  "starts_at": "2026-09-01T18:00:00+10:00",
  "ends_at": "2026-09-01T20:00:00+10:00",
  "player": { "name": "Cal Brown", "email": "cal@example.com" },
  "notes": "birthday group",
  "flags": { "kiosk": true }
}
```

Response `200`:

```json
{
  "id": "0f0a…",
  "external_ref": "acuity-88213",
  "status": "scheduled",
  "bay_ref": "bay-1",
  "starts_at": "2026-09-01T08:00:00Z",
  "ends_at": "2026-09-01T10:00:00Z",
  "created": true
}
```

Rules:

- **Idempotent on `(venue_id, external_ref)`.** Re-POSTing the same body is a no-op that
  returns `created: false`. Re-POSTing with new times is a reschedule.
- Timestamps must be ISO 8601 with an offset, or UTC `Z`. Naive local strings are rejected.
- `ends_at` must be after `starts_at`; max session length is a venue setting.
- Overlapping sessions on the same bay are rejected with `409 bay_conflict` unless
  `"allow_overlap": true` is passed.
- `player.email` is the key for settings restore. Without it the session still runs, just
  with no personal settings.
- Unknown fields are ignored, never an error — integrators add junk.

## Bulk sync

`POST /v1/sessions/bulk`

```json
{
  "bay_ref": "bay-1",
  "window": { "from": "2026-09-01T00:00:00+10:00", "to": "2026-09-02T00:00:00+10:00" },
  "mode": "replace",
  "sessions": [ { "external_ref": "…", "starts_at": "…", "ends_at": "…", "player": {} } ]
}
```

`mode: "replace"` cancels anything in the window that isn't in the payload (only sessions
from the same `source`). `mode: "merge"` upserts and leaves the rest alone.

## Errors

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_payload` | Validation failed; `details` lists each field |
| 401 | `invalid_key` | Missing / bad / revoked key |
| 404 | `bay_not_found` | `bay_ref` doesn't exist for this venue |
| 409 | `bay_conflict` | Overlaps an existing session |
| 422 | `window_too_long` | Exceeds the venue's max session length |
| 429 | `rate_limited` | Per-key limit; `Retry-After` header set |

Every response carries a `request_id`. Every write is logged so support can answer "did our
booking system actually send it?" without guesswork.

## Manual / walk-in sessions

Zero-integration fallback, required for v1:

- **In the controller app:** "Start walk-in" — pick duration and optional name, creates a
  session with `source: "manual"` starting now.
- **In the dashboard:** create/edit a session on any bay.

Manual sessions are ordinary rows, so they get identical automation.

## Outbound webhooks (v1.1, not v1)

`session.started`, `session.ended`, `session.extended`, `bay.offline`, `bay.online` —
signed with a per-venue secret. Deferred deliberately: pull integrations and push-back both
add support burden before there are customers.
