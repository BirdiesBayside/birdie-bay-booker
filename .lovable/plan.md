# Why the Hub feels slow — findings and fix

The backend server itself is healthy (memory 47%, connections 17 of 90, disk 9%). So this is not "we need a bigger server". The slowness comes from a small number of very expensive or very repetitive requests.

## What I found

**1. The members count is the single worst offender (biggest fixable win)**
The admin dashboard asks for every non-visitor customer record just to count them, and the security rules re-check "is this person an admin?" once for every single row. That makes a count of ~1,500 customers take ~32ms each time — and it has run ~74,000 times, more total time than almost anything else on the database. The same page then repeats the identical request a second time to work out weekly member revenue.

**2. That dashboard auto-refreshes every 30 seconds**
Every open admin tab re-runs about ten separate queries (bookings, POS sales, membership payments, occupancy, members twice, month-on-month) every 30 seconds — even if nobody is looking at it. Leave a couple of tabs open all day and that is thousands of heavy requests.

**3. Admin security checks are unnecessarily re-evaluated per row**
The "admins can view all" rule on the customers table (and others like it) is written so it is recalculated for every row scanned instead of once per request. This is the root cause behind point 1 and quietly slows every admin list.

**4. Bay controllers are chatting constantly**
The six bay PCs account for millions of tiny requests: heartbeats, booking lookups, bay lookups, command polling and a timezone lookup — several per second, per bay, all day. Each is fast on its own, but together they are a constant background load and they push out anything the Hub needs. Some are avoidable (the timezone and bay-name lookups never change but are fetched every cycle).

**5. Two admin lists have no supporting index**
The customer picker loads every customer sorted by name, and the POS lookup scans all transactions. Both are noticeably slow on admin pages.

## The fix

1. **Count members properly** — ask the database for a count instead of downloading every record, and do it once instead of twice on the dashboard.
2. **Rewrite the admin security rules** so the admin check runs once per request rather than once per row (customers table first, then the other admin-wide rules).
3. **Slow the dashboard auto-refresh** from 30 seconds to 2 minutes, and pause it entirely when the tab is in the background.
4. **Add indexes** for the customer name list and the POS transaction lookup.
5. **Trim bay controller chatter** — cache the venue timezone and bay details in the controller instead of re-fetching them every cycle, and ease the command-polling interval. (No change to how bays power on/off or to their timing.)

## Technical notes

- `AdminDashboard.tsx` `fetchStats()`: replace both `.select('membership_tier')` reads with `select('membership_tier', { count: 'exact', head: false })` / a single fetch reused for count + weekly fee total; raise the `setInterval` from 30000 to 120000 and gate it on `document.visibilityState`.
- RLS: rewrite `has_role(auth.uid(), 'admin'::app_role)` as `(select has_role(auth.uid(), 'admin'::app_role))` in the profiles admin policies (and equivalent admin-wide policies elsewhere) so Postgres treats it as an InitPlan evaluated once.
- New indexes: `profiles (first_name, last_name)`; `pos_transactions (status) where booking_id is not null`.
- Bay controller polling: `system_settings.timezone` (3.28M calls) and `bays` by bay_number (5.49M calls) are effectively static — fetch once per app session. `bay_commands` pending poll is 2.73M calls; it already has a partial index, so the change is interval only.

## Not doing

No compute upgrade — the server has plenty of headroom; the problem is query shape and request volume, not hardware.
