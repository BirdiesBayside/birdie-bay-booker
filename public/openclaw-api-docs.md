# Birdies Hub — OpenClaw API Documentation

## Overview

The OpenClaw API provides full read/write access to the Birdies Hub backend. It's a single endpoint that accepts JSON commands via POST requests.

---

## Connection Details

| Field | Value |
|-------|-------|
| **Endpoint** | `https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/openclaw-api` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Auth Header** | `x-openclaw-key: <YOUR_API_KEY>` |

### Authentication

Every request must include the API key in the `x-openclaw-key` header:

```
x-openclaw-key: <your-api-key>
```

Alternatively, you can use a Bearer token:

```
Authorization: Bearer <your-api-key>
```

---

## Request Format

All requests are JSON POST bodies with an `action` field and optional parameters:

```json
{
  "action": "get-dashboard-stats"
}
```

```json
{
  "action": "get-customers",
  "search": "john",
  "limit": 10
}
```

---

## Read Actions

### `get-daily-summary` ⭐ NEW — Recommended for revenue reconciliation
Returns a structured, Brisbane-aware daily breakdown of all revenue streams with line items.

**Parameters:**
| Param | Type | Required | Default |
|-------|------|----------|---------|
| `date` | `string` (YYYY-MM-DD) | No | Today (Brisbane time) |

**Example:**
```json
{ "action": "get-daily-summary", "date": "2026-03-16" }
```

**Response:**
```json
{
  "date": "2026-03-16",
  "timezone": "Australia/Brisbane",
  "bookings": {
    "count": 8,
    "revenue": 320.00,
    "items": [{ "id": "uuid", "total_price": 40.00, "status": "confirmed", "payment_method": "card", "stripe_payment_intent_id": "pi_..." }]
  },
  "pos": {
    "count": 3,
    "revenue": 45.00,
    "items": [{ "id": "uuid", "total": 15.00, "payment_method": "cash", "created_at": "..." }]
  },
  "memberships": {
    "count": 1,
    "revenue": 89.00,
    "items": [{ "id": "uuid", "amount": 89.00, "tier": "birdie", "stripe_invoice_id": "in_..." }]
  },
  "totals": {
    "revenue": 454.00,
    "booking_revenue": 320.00,
    "pos_revenue": 45.00,
    "membership_revenue": 89.00
  }
}
```

---

### `get-range-summary` ⭐ NEW — Multi-day revenue summary
Returns aggregated Brisbane-aware revenue totals for a date range.

**Parameters:**
| Param | Type | Required | Default |
|-------|------|----------|---------|
| `from` | `string` (YYYY-MM-DD) | No | Today |
| `to` | `string` (YYYY-MM-DD) | No | Today |

**Example:**
```json
{ "action": "get-range-summary", "from": "2026-03-01", "to": "2026-03-16" }
```

---

### `get-dashboard-stats`
Returns a real-time overview of the business. Now Brisbane-aware and includes POS revenue.

**Parameters:**
| Param | Type | Required | Default |
|-------|------|----------|---------|
| `date` | `string` (YYYY-MM-DD) | No | Today (Brisbane time) |

**Response:**
```json
{
  "date": "2026-03-16",
  "timezone": "Australia/Brisbane",
  "today": {
    "bookings_count": 8,
    "revenue": 320.00
  },
  "last_30_days": {
    "from": "2026-02-14",
    "to": "2026-03-16",
    "booking_revenue": 4500.00,
    "pos_revenue": 850.00,
    "membership_revenue": 2100.00,
    "total_revenue": 7450.00,
    "bookings_count": 142,
    "pos_count": 67
  },
  "membership_breakdown": {
    "visitor": 85,
    "par": 12,
    "birdie": 8,
    "eagle": 3,
    "albatross": 1
  },
  "total_customers": 109,
  "active_members": 24
}
```

---

### `get-booking`
Returns full details of a single booking.

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `booking_id` | `string` (UUID) | Yes |

**Example:**
```json
{ "action": "get-booking", "booking_id": "abc-123-..." }
```

---

### `get-customers`
Search and list customer profiles.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `search` | `string` | No | Searches name and email |
| `membership_tier` | `string` | No | Filter: `visitor`, `weekday`, `par`, `birdie`, `eagle`, `albatross` |
| `limit` | `number` | No | Default 100 |

**Example:**
```json
{ "action": "get-customers", "search": "smith", "membership_tier": "birdie" }
```

**Response:** `{ "customers": [...], "count": 3 }`

---

### `get-customer`
Returns a single customer's full profile, recent bookings (last 20), and deposit transaction history.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | `string` (UUID) | One required | The auth user ID |
| `email` | `string` | One required | Customer email |

**Example:**
```json
{ "action": "get-customer", "email": "john@example.com" }
```

**Response:**
```json
{
  "customer": { "first_name": "John", "membership_tier": "birdie", "deposit_balance": 45.00, ... },
  "bookings": [...],
  "deposit_transactions": [...]
}
```

---

### `get-bay-status`
Returns all bays, their device status (online/offline, plug state), and upcoming blocks.

**Parameters:** None

**Example:**
```json
{ "action": "get-bay-status" }
```

---

### `get-league-standings`
Returns SGT tour leaderboard standings.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `tour_id` | `number` | No | Defaults to current active tour |

**Example:**
```json
{ "action": "get-league-standings" }
```

---

### `get-membership-payments`
Returns membership payment history.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | `string` | No | Filter by customer |
| `limit` | `number` | No | Default 50 |

---

### `get-pos-transactions`
Returns recent point-of-sale transactions.

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `limit` | `number` | No (default 50) |

---

### `get-gift-cards`
Returns all gift cards and their status (pending/redeemed).

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `limit` | `number` | No (default 50) |

---

### `get-announcements`
Returns current and past announcements.

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `limit` | `number` | No (default 20) |

---

### `get-bay-logs`
Returns bay controller event logs (useful for diagnostics).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `bay_number` | `number` | No | Filter by bay |
| `event_level` | `string` | No | `info`, `warn`, `error` |
| `limit` | `number` | No | Default 50 |

---

## Write Actions

### `cancel-booking`
Cancels a booking and automatically processes the appropriate refund (Stripe card refund or balance credit).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `booking_id` | `string` (UUID) | Yes | The booking to cancel |
| `send_notification` | `boolean` | No | Default `true` — sends email to customer |

**Example:**
```json
{ "action": "cancel-booking", "booking_id": "abc-123-...", "send_notification": true }
```

**Response:**
```json
{
  "success": true,
  "booking_id": "abc-123-...",
  "refund": { "type": "stripe", "refund_id": "re_...", "amount": 40.00, "status": "succeeded" }
}
```

---

### `cancel-membership`
Cancels a customer's membership — cancels Stripe subscription(s) and downgrades to "visitor" tier.

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `user_id` | `string` (UUID) | Yes |

**Example:**
```json
{ "action": "cancel-membership", "user_id": "uuid-..." }
```

**Response:**
```json
{
  "success": true,
  "previous_tier": "birdie",
  "cancelled_subscriptions": ["sub_..."]
}
```

---

### `create-booking`
Creates a new confirmed booking (admin-style, no payment processing).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | `string` (UUID) | Yes | Customer's auth user ID |
| `bay_id` | `string` (UUID) | Yes | Bay UUID |
| `booking_date` | `string` | Yes | `YYYY-MM-DD` |
| `start_time` | `string` | Yes | `HH:MM` (24hr) |
| `end_time` | `string` | Yes | `HH:MM` (24hr) |
| `duration_hours` | `number` | Yes | e.g. `1`, `2` |
| `hourly_rate` | `number` | Yes | e.g. `40.00` |
| `total_price` | `number` | Yes | e.g. `80.00` |
| `player_count` | `number` | No | Default 1 |
| `payment_method` | `string` | No | Default `"admin"` |
| `notes` | `string` | No | Default `"Created via OpenClaw API"` |

**Example:**
```json
{
  "action": "create-booking",
  "user_id": "uuid-...",
  "bay_id": "uuid-...",
  "booking_date": "2026-03-20",
  "start_time": "14:00",
  "end_time": "16:00",
  "duration_hours": 2,
  "hourly_rate": 40,
  "total_price": 80,
  "notes": "Booked by OC for regular session"
}
```

---

### `add-credit`
Adds deposit credit to a customer's balance.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | `string` (UUID) | Yes | Customer's auth user ID |
| `amount` | `number` | Yes | Dollar amount to add |
| `description` | `string` | No | Reason for the credit |

**Example:**
```json
{ "action": "add-credit", "user_id": "uuid-...", "amount": 25, "description": "Compensation for bay issue" }
```

**Response:**
```json
{ "success": true, "balance_before": 20.00, "balance_after": 45.00 }
```

---

### `update-membership`
Changes a customer's membership tier directly (does NOT handle Stripe subscriptions — use for manual overrides only).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | `string` (UUID) | Yes | Customer's auth user ID |
| `tier` | `string` | Yes | One of: `visitor`, `weekday`, `par`, `birdie`, `eagle`, `albatross` |

**Example:**
```json
{ "action": "update-membership", "user_id": "uuid-...", "tier": "eagle" }
```

---

### `create-announcement`
Creates a new in-app announcement visible to customers.

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | Yes | Announcement title |
| `content` | `string` | Yes | Announcement body text |
| `members_only` | `boolean` | No | Default `false` |
| `expires_at` | `string` (ISO datetime) | No | Auto-expire date |

**Example:**
```json
{
  "action": "create-announcement",
  "title": "Easter Weekend Hours",
  "content": "We'll be open 8am-10pm over the Easter long weekend!",
  "members_only": false,
  "expires_at": "2026-04-22T00:00:00Z"
}
```

---

### `block-bay`
Blocks a bay for a specific date and time range (e.g. maintenance, private events).

**Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `bay_id` | `string` (UUID) | Yes | Bay UUID |
| `block_date` | `string` | Yes | `YYYY-MM-DD` |
| `start_time` | `string` | Yes | `HH:MM` |
| `end_time` | `string` | Yes | `HH:MM` |
| `reason` | `string` | No | Reason for block |

---

### `unblock-bay`
Removes a bay block.

**Parameters:**
| Param | Type | Required |
|-------|------|----------|
| `block_id` | `string` (UUID) | Yes |

---

## Discovery

Send `{ "action": "list-actions" }` to get a machine-readable list of all available actions and their parameters.

---

## Membership Tiers Reference

| Tier | Description |
|------|-------------|
| `visitor` | Non-member / casual |
| `weekday` | Weekday-only membership |
| `par` | Par membership |
| `birdie` | Birdie membership |
| `eagle` | Eagle membership |
| `albatross` | Albatross (top tier) |

---

## Error Handling

All errors return a JSON object with an `error` field:

```json
{ "error": "booking_id required" }
```

| HTTP Status | Meaning |
|-------------|---------|
| `200` | Success |
| `400` | Bad request (missing params, invalid action) |
| `401` | Unauthorized (bad or missing API key) |
| `500` | Server error |

---

## Notes

- All times are in **24-hour format** (e.g. `14:00`, not `2:00 PM`)
- All dates are **YYYY-MM-DD** format
- UUIDs are used for all IDs (bookings, bays, customers)
- The `cancel-booking` action handles both Stripe refunds and balance refunds automatically
- The `create-booking` action creates **confirmed** bookings — it will fail if the time slot overlaps with an existing booking (enforced by database triggers)
- Currency is **AUD** throughout
