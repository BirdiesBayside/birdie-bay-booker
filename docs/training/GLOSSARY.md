# Glossary

Plain-English definitions of every term used in this course.

| Term | Meaning |
| --- | --- |
| **Aggregate** | A pre-calculated total (e.g. bookings per customer) kept up to date automatically so pages don't have to count rows every load. |
| **Ambrose** | A team golf format used in the venue's weekly local competition. |
| **Auto / manual mode** | Whether a bay's automation is running (auto) or suspended for staff work (manual). |
| **Baseline settings** | The venue's known-good golf software settings, restored before every session. |
| **BASELINE HUB** | The neutral, de-branded copy of the platform that every new client is remixed from. |
| **Bay** | One simulator room/booth. |
| **Bay Controller** | The Windows app installed on each bay PC that automates power, launch and shutdown. |
| **Column** | A field in a table (e.g. `start_time`). |
| **Credit** | Account balance a customer can spend on bookings, from promos, refunds or gift cards. |
| **Cron job** | A task that runs automatically on a schedule. |
| **De-brand** | Remove one venue's identity so the copy is neutral. |
| **Edge function** | A small program running on the server rather than in the browser; used for anything secret or trusted. |
| **Gross / net** | Score before / after handicap adjustment. |
| **Handicap** | A number that levels players of different ability. |
| **Idempotent** | Safe to run more than once — the second run changes nothing. Essential for payments and webhooks. |
| **Kiosk mode** | Locking the bay PC so customers can only use the golf software. |
| **Ledger** | An append-only record of every credit movement, so any balance can be explained. |
| **Merge tag** | A placeholder in a template replaced with the recipient's own value, e.g. first name. |
| **Migration** | A recorded, permanent change to the database structure. |
| **Off-peak / peak** | Cheaper and more expensive time bands for bay hire. |
| **Paging** | Fetching a large list in chunks, because a single query returns at most 1,000 rows. |
| **Pending / confirmed** | A booking awaiting payment vs a paid booking. |
| **POS** | Point of sale — food and drink ordering to the bay. |
| **Preview** | Your private working copy of the app. |
| **Publish** | Pushing your work live to the real URL. |
| **Remix** | Making a fresh, independent copy of a project. Carries the code and docs; does not carry chat history. |
| **RLS (Row Level Security)** | Database rules controlling which rows each user may read or change. |
| **Row** | One record in a table (one booking, one customer). |
| **Secret** | An API key or password stored server-side, never in code or chat. |
| **Segment** | A saved group of customers for marketing. |
| **SGT** | The external online golf tour service used for the league. |
| **State machine** | Explicit named states (IDLE, RUNNING…) instead of ad-hoc timers. |
| **Storage** | File storage for videos, snapshots and uploads. |
| **Suppression list** | Customers who must not receive marketing email. |
| **Table** | A spreadsheet-like collection of rows in the database. |
| **Tenant config** | All the venue-specific values (hours, prices, phone, branding) kept as configuration. |
| **Tier** | A membership level. |
| **Timezone helper** | The shared functions that force all date logic into the venue's timezone. |
| **Watchdog** | A background task that restarts the Bay Controller if it stops. |
| **Webhook** | A third party calling our server to tell us something happened. |
