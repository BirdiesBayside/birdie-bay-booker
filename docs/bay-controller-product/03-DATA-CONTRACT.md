# 03 — Data Contract

## Part A — what the controller touches today (Birdies)

### Tables

| Table | Use |
| --- | --- |
| `bays` | `id`, `bay_number`, `name`. Controller resolves its bay by number (hardcoded 1–6 limit in the API). |
| `bay_devices` | One row per bay: `is_online`, `last_seen`, `app_version`, `control_mode` (`auto`/`manual`), plug config. Upserted on `bay_id` by the heartbeat. |
| `bay_commands` | Command queue. Mode toggles are INSERTs (`command: 'auto' \| 'manual'`), consumed via Realtime + polling. |
| `bay_controller_logs` | `bay_number`, `event_type`, `event_level`, `message`, `details` (includes `local_timestamp`), `booking_id`, `app_version`. |
| `bookings` | Read for the schedule: bay, start/end, status (`confirmed`/`pending`), customer name/id, tags. **This is the coupling to remove.** |
| `bay_orders` | POS ordering — out of scope for v1. |

### Edge function `bay-controller-api`

Single function, action-dispatched (`?action=` / header / body). Current actions:

`heartbeat`, `log`, `get_user_setting`, `save_user_setting`, `ingest_range_session`,
`should_record`, `recording_start`, `recording_stop`, `recording_upload_url`,
`recording_stream_upload_url`, `recording_hole`, and the default `bookings` fetch.

For v1 keep only: `heartbeat`, `log`, `get_user_setting`, `save_user_setting`, and replace
`bookings` with `sessions`.

### Edge function `bay-user-settings`

Storage-backed per-player snapshots. `GET ?user_id=&file=` returns `{ exists, base64 }`;
`POST { user_id, file, base64 }` upserts into a private bucket at `{user_id}/{file}`.
Allow-list of filenames only. Auth: signed-in admin.

Generalise this to `player_settings` keyed by venue + player, with an allow-list of files
configured per venue (different simulator software = different files).

## Part B — target schema (multi-tenant)

Every table lives in `public`, carries `venue_id`, has RLS scoped to venue membership, and
explicit GRANTs. Controller and API writes go through `service_role`.

```text
venues            id, name, slug, timezone, contact_phone, logo_url, settings jsonb
venue_users       id, venue_id, user_id, role (owner|manager|staff)
bays              id, venue_id, bay_ref (unique per venue), name, sort_order, active
bay_devices       id, venue_id, bay_id (unique), control_mode, is_online, last_seen,
                  app_version, plug_driver, plug_config jsonb, launch_config jsonb
bay_pcs           id, venue_id, bay_id, machine_id, pairing_code, paired_at,
                  last_seen, app_version
bay_commands      id, venue_id, bay_id, command, payload jsonb, consumed_at
sessions          id, venue_id, bay_id, external_ref (unique per venue), source,
                  starts_at, ends_at, status (scheduled|active|completed|cancelled),
                  player_name, player_email, notes, flags jsonb
api_keys          id, venue_id, name, key_hash, key_prefix, last_used_at, revoked_at
controller_logs   id, venue_id, bay_id, event_type, event_level, message,
                  details jsonb (incl. local_timestamp), session_id, app_version
player_settings   id, venue_id, player_email, file_name, storage_path, captured_at
```

All tables get `created_at` / `updated_at` with an update trigger.

### Access rules

- Staff read/write rows for venues they belong to (`venue_users` membership check via a
  `SECURITY DEFINER` helper — never a recursive policy, never roles on a profile table).
- `anon` gets nothing.
- `service_role` gets full access — the controller and the public API authenticate with a
  venue API key at the edge and use the service role underneath.
- API keys are stored hashed; only `key_prefix` is ever displayed after creation.

### Migration shape (per table)

1. `CREATE TABLE public.<t> (...)`
2. `GRANT SELECT, INSERT, UPDATE, DELETE ON public.<t> TO authenticated;`
   `GRANT ALL ON public.<t> TO service_role;`
3. `ALTER TABLE public.<t> ENABLE ROW LEVEL SECURITY;`
4. `CREATE POLICY ...` scoped to venue membership.

### Indexes that matter

- `sessions (venue_id, bay_id, starts_at)` — the scheduler query.
- `sessions (venue_id, external_ref)` unique — API idempotency.
- `bay_commands (bay_id, consumed_at)` — command polling.
- `controller_logs (venue_id, bay_id, created_at desc)` — log viewer.
