// Peak/off-peak pricing utilities

export interface PricingConfigRow {
  tier: string;
  hourly_rate: number;
  effective_from?: string;
  display_order?: number;
  weekly_subscription_price?: number | null;
}

/**
 * Determines if a given date and time is during peak hours.
 * Peak times: Friday-Sunday (all day) + Monday-Thursday (4pm onwards)
 * Off-peak times: Monday-Thursday (before 4pm)
 */
export function isPeakTime(date: Date, startTime: string): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = parseInt(startTime.split(":")[0], 10);
  
  // Weekend (Friday = 5, Saturday = 6, Sunday = 0) is always peak
  if (dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6) {
    return true;
  }
  
  // Monday-Thursday: peak if 4pm (16:00) or later
  return hour >= 16;
}

/**
 * Checks if a booking time is valid for a Weekday membership.
 * Weekday members can only book Mon-Thu before 4pm at member rate.
 */
export function isWeekdayMemberTime(date: Date, startTime: string): boolean {
  const dayOfWeek = date.getDay();
  const hour = parseInt(startTime.split(":")[0], 10);
  
  // Must be Monday (1) through Thursday (4)
  if (dayOfWeek < 1 || dayOfWeek > 4) {
    return false;
  }
  
  // Must be before 4pm
  return hour < 16;
}

export const VISITOR_OFF_PEAK_RATE = 30;

/**
 * Get the active visitor peak rate for a given booking date.
 * Pricing config rows have an effective_from date; the row with the
 * latest effective_from that is still <= the booking date wins.
 * Falls back to $35 if no matching row is found.
 */
export function getVisitorPeakRateForDate(
  pricingConfig: PricingConfigRow[],
  date: Date | string
): number {
  const dateStr = typeof date === "string" ? date : formatLocalDateKey(date);
  const rows = pricingConfig
    .filter((p) => p.tier === "visitor" && p.effective_from && p.effective_from <= dateStr)
    .sort((a, b) => (a.effective_from! > b.effective_from! ? -1 : 1));
  return rows[0]?.hourly_rate ?? 40;
}

/**
 * Convert pricing config rows into a simple Record<string, number> for the
 * latest effective rates (useful for membership pages that don't need date-based lookup).
 */
export function toLatestTierPricing(pricingConfig: PricingConfigRow[]): Record<string, number> {
  const today = formatLocalDateKey(new Date());
  const result: Record<string, number> = {};
  for (const row of pricingConfig) {
    if (row.effective_from && row.effective_from > today) continue;
    if (result[row.tier] == null || row.effective_from! > today) {
      result[row.tier] = row.hourly_rate;
    } else {
      result[row.tier] = row.hourly_rate;
    }
  }
  return result;
}

/**
 * Gets the appropriate hourly rate based on membership tier, date, and time.
 * 
 * Visitor rates:
 *   - Peak: $40/hr from 21 Aug 2026, $35/hr before that
 *   - Off-peak: $30/hr
 * 
 * Weekday Member:
 *   - Weekdays before 4pm: member rate
 *   - Other times: Visitor peak rate for the booking date
 * 
 * Birdie Member: member rate (anytime)
 * Eagle Member: member rate (anytime)
 */
export function calculateHourlyRate(
  tier: string,
  date: Date,
  startTime: string,
  tierPricing: Record<string, number> | PricingConfigRow[],
  options?: { segment?: string | null; holidaySurchargePercent?: number }
): number {
  const isPeak = isPeakTime(date, startTime);
  
  const visitorPeakRate = Array.isArray(tierPricing)
    ? getVisitorPeakRateForDate(tierPricing, date)
    : (tierPricing.visitor || 35);

  let baseRate: number;

  // Staff get free play during off-peak, full visitor rate during peak
  if (options?.segment === "staff") {
    baseRate = isPeak ? visitorPeakRate : 0;
  } else {
    switch (tier.toLowerCase()) {
      case "visitor":
        baseRate = isPeak ? visitorPeakRate : VISITOR_OFF_PEAK_RATE;
        break;
      case "weekday":
        // Weekday members pay their rate for off-peak weekday slots
        // Otherwise they pay visitor peak rate for the booking date
        baseRate = isWeekdayMemberTime(date, startTime) 
          ? (Array.isArray(tierPricing) 
              ? (tierPricing.find(p => p.tier === 'weekday')?.hourly_rate ?? 10)
              : (tierPricing.weekday || 10))
          : visitorPeakRate;
        break;
      case "birdie":
        baseRate = Array.isArray(tierPricing)
          ? (tierPricing.find(p => p.tier === 'birdie')?.hourly_rate ?? 10)
          : (tierPricing.birdie || 10);
        break;
      case "eagle":
        baseRate = Array.isArray(tierPricing)
          ? (tierPricing.find(p => p.tier === 'eagle')?.hourly_rate ?? 8)
          : (tierPricing.eagle || 8);
        break;
      default:
        // Unknown tier defaults to peak visitor rate for the booking date
        baseRate = visitorPeakRate;
    }
  }

  // Apply public holiday surcharge if applicable. Free play stays free.
  const surcharge = options?.holidaySurchargePercent ?? 0;
  if (surcharge > 0 && baseRate > 0) {
    return Math.round((baseRate * (1 + surcharge / 100)) * 100) / 100;
  }
  return baseRate;
}

/**
 * Format a Date as YYYY-MM-DD using local time (matches DB date column format).
 */
export function formatLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns a display label for the pricing period
 */
export function getPricingLabel(date: Date, startTime: string): "peak" | "off-peak" {
  return isPeakTime(date, startTime) ? "peak" : "off-peak";
}

/**
 * Format day name for display
 */
export function getDayName(date: Date): string {
  return date.toLocaleDateString("en-AU", { weekday: "long" });
}

/**
 * Round duration to the nearest half-credit unit.
 * 1 hour = 1 credit, 30 min = 0.5 credit.
 */
export function hoursToCredits(hours: number): number {
  return Math.round(hours * 2) / 2;
}

/**
 * Format a credit balance for display (e.g. 1.5 → "1.5 hours").
 */
export function formatCreditBalance(credits: number): string {
  return `${credits.toFixed(credits % 1 === 0 ? 0 : 1)} hour${credits === 1 ? "" : "s"}`;
}
