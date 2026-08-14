# Peak Rate Scenario Chart ($35 vs $42)

## The numbers (last 3 months, actual data)

Only bookings billed at the $35 visitor peak rate are affected. Member rates ($8/$10), off-peak $30, and free/staff sessions stay unchanged.

| Month | Peak hours @ $35 | Actual peak revenue | At $42/hr | Uplift |
|---|---|---|---|---|
| May 2026 | 305 | $10,675 | $12,810 | +$2,135 |
| Jun 2026 | 325 | $11,375 | $13,650 | +$2,275 |
| Jul 2026 | 294 | $10,290 | $12,348 | +$2,058 |
| Aug 2026 (to 14th) | 160 | $5,600 | $6,720 | +$1,120 |
| **Total** | **1,084** | **$37,940** | **$45,528** | **+$7,588** |

Full-month average uplift is roughly **$2,150/month**, or about **+12.7%** on total booking revenue (assumes no drop in demand from the price rise).

## What to build

Add a "Peak Rate Scenario" card to Admin > Analytics, under the Revenue Trend chart:

- Grouped bar chart per month: actual revenue vs. scenario revenue, with the uplift called out.
- A slider or number input for the hypothetical peak rate (default $42) so other rates can be tested instantly.
- A date range (default last 3 months) matching the existing Revenue Trend controls.
- Summary line above the chart: total uplift $ and % over the selected range.

## Technical notes

- New hook `src/hooks/usePeakRateScenario.ts`: pull `bookings` (`booking_date`, `start_time`, `duration_hours`, `hourly_rate`, `total_price`, `status`) for the range, non-cancelled, paginated with `.range()`.
- Scenario revenue = actual revenue + `(newRate - 35) * duration_hours` for rows where `hourly_rate = 35` and the slot is peak per `isPeakTime()` in `src/lib/pricing-utils.ts`. All other rows pass through unchanged.
- Bucket by Brisbane month using the same helpers as `useRevenueTrend.ts`.
- New component `src/components/admin/analytics/PeakRateScenarioChart.tsx` using recharts + `ChartContainer`, semantic tokens only, rendered from `src/pages/admin/AdminAnalytics.tsx`.
- Read-only: no pricing config or booking data is changed.
