

# Analytics Dashboard for Birdies

## Overview

I recommend creating a **dedicated Analytics page** in the admin menu (rather than a section within Settings) because the scope of metrics warrants its own focused view. This will give you a clear, data-driven command center for monitoring business performance.

---

## Recommended Key Performance Indicators (KPIs)

Based on your data and business model, here are the most critical metrics organized by category:

### 1. Customer Growth & Retention (Most Important)

| Metric | What It Tells You | Current Data |
|--------|-------------------|--------------|
| **New Customers (Weekly/Monthly)** | Acquisition velocity | 42 in last 7 days |
| **Return Rate** | % of first-timers who book again | 9.5% (4/42 recently) |
| **Customer Lifetime Bookings** | Distribution of engagement depth | 63% have 1 booking, 25% have 2-3 |
| **Membership Conversion Rate** | % of users who upgrade from visitor | 4.3% (33/769) |

### 2. Revenue Health

| Metric | What It Tells You | Current Data |
|--------|-------------------|--------------|
| **Month-over-Month Revenue Growth** | Business trajectory | Already tracked |
| **Revenue by Source** | Bookings vs POS vs Memberships | Integrated in existing dashboard |
| **Average Booking Value** | Pricing effectiveness | $33.94 |
| **Average Session Duration** | Customer engagement | 1.6 hours |

### 3. Operational Efficiency

| Metric | What It Tells You | Current Data |
|--------|-------------------|--------------|
| **Bay Utilization by Day** | Peak demand patterns | Saturdays highest (89 hrs), Wednesdays lowest (59 hrs) |
| **Peak Hours Heatmap** | When to staff up | Derivable from booking times |
| **Occupancy Rate** | Capacity usage | Already tracked on dashboard |

### 4. Marketing Effectiveness

| Metric | What It Tells You | Current Data |
|--------|-------------------|--------------|
| **First Session Free Conversion** | Promo ROI | Tracked in Marketing page |
| **Gift Card Redemption Rate** | Credit program effectiveness | 67% (2/3 redeemed) |
| **Member Churn Rate** | Retention health | New metric to calculate |

---

## Proposed Implementation

### New Admin Page: `/admin/analytics`

```text
+------------------------------------------------------------------+
|  ANALYTICS                                          [Date Range] |
+------------------------------------------------------------------+
|                                                                  |
|  GROWTH METRICS                                                  |
|  +------------+  +------------+  +------------+  +------------+  |
|  | New        |  | Return     |  | Member     |  | Churn      |  |
|  | Customers  |  | Rate       |  | Conversion |  | Rate       |  |
|  |    42      |  |   9.5%     |  |    4.3%    |  |   2.1%     |  |
|  | +18% ↑     |  | (target:   |  | (target:   |  | (low is    |  |
|  |            |  |  15%)      |  |  10%)      |  |  good)     |  |
|  +------------+  +------------+  +------------+  +------------+  |
|                                                                  |
|  REVENUE TRENDS                                                  |
|  +-------------------------------------------------------+       |
|  |   Monthly Revenue Chart (6 months)                    |       |
|  |   [Bar chart: Dec $80 -> Jan $6,930 -> Feb $3,880*]   |       |
|  +-------------------------------------------------------+       |
|                                                                  |
|  CUSTOMER ENGAGEMENT                                             |
|  +---------------------------+  +---------------------------+    |
|  | Booking Frequency         |  | Day-of-Week Performance   |    |
|  | Pie: 1x (63%), 2-3x (25%),|  | Bar: Mon-Sun utilization  |    |
|  |      4-10x (9%), 10+ (3%) |  |                           |    |
|  +---------------------------+  +---------------------------+    |
|                                                                  |
|  OPERATIONAL INSIGHTS                                            |
|  +-------------------------------------------------------+       |
|  |   Hourly Heatmap: Bay utilization by hour/day         |       |
|  +-------------------------------------------------------+       |
|                                                                  |
+------------------------------------------------------------------+
```

### Navigation Update

Add "Analytics" to the admin sidebar with a `BarChart3` icon, positioned after "Dashboard" for logical grouping of overview pages.

---

## Technical Approach

### Files to Create/Modify

1. **Create `src/pages/admin/AdminAnalytics.tsx`**
   - New page component with the analytics dashboard
   - Uses Recharts (already installed) for visualizations
   - Date range selector for flexible time periods
   - Auto-refresh every 60 seconds

2. **Modify `src/components/admin/AdminLayout.tsx`**
   - Add Analytics to the nav items array

3. **Modify `src/App.tsx`**
   - Add route for `/admin/analytics`

4. **Create `src/components/admin/analytics/`** (optional folder for sub-components)
   - `GrowthMetricCard.tsx` - Stat card with trend indicator
   - `RevenueChart.tsx` - Monthly revenue bar chart
   - `CustomerEngagementChart.tsx` - Booking frequency pie chart
   - `DayOfWeekChart.tsx` - Bar chart for day-of-week utilization
   - `HourlyHeatmap.tsx` - Heatmap grid for peak hours

### Data Sources

All metrics are derivable from existing tables:
- `bookings` - Customer activity, revenue, occupancy
- `profiles` - Membership tiers, conversion tracking
- `pos_transactions` - POS revenue
- `membership_payments` - Subscription revenue
- `gift_cards` - Promo effectiveness

### Key Queries

```sql
-- Return Rate (customers with 2+ bookings)
WITH user_counts AS (
  SELECT user_id, COUNT(*) as bookings
  FROM bookings WHERE status != 'cancelled'
  GROUP BY user_id
)
SELECT 
  COUNT(*) FILTER (WHERE bookings >= 2) * 100.0 / COUNT(*) as return_rate
FROM user_counts;

-- New Customers This Period
SELECT COUNT(DISTINCT user_id)
FROM (
  SELECT user_id, MIN(created_at) as first_booking
  FROM bookings WHERE status != 'cancelled'
  GROUP BY user_id
) WHERE first_booking >= [start_date];

-- Membership Churn (cancelled subscriptions this month)
SELECT COUNT(*) FROM profiles 
WHERE membership_tier = 'visitor'
  AND updated_at >= [start_of_month]
  AND user_id IN (
    SELECT user_id FROM membership_payments 
    WHERE paid_at < [start_of_month]
  );
```

---

## Why These Metrics Matter

1. **Return Rate** - Your single most important growth lever. If only 9.5% come back, you need 10 new customers to replace every churned regular. Increasing this to 20% would double your organic growth.

2. **New Customer Acquisition** - Shows marketing effectiveness and word-of-mouth. The 42/week is strong; track whether it's growing or declining.

3. **Member Conversion** - At 4.3%, there's significant upside. Members pay $15-35/week recurring vs one-off bookings.

4. **Day/Hour Patterns** - Saturdays and Fridays are busiest. Use this to optimize staffing, promotions for slow periods, and premium pricing for peak times.

---

## Next Steps After Approval

1. Create the AdminAnalytics page with core KPI cards
2. Add Recharts visualizations for trends
3. Implement date range filtering
4. Add the navigation item and route
5. Test the data calculations for accuracy

