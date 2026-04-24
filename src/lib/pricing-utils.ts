// Peak/off-peak pricing utilities

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

// Visitor pricing constants
export const VISITOR_PEAK_RATE = 35;
export const VISITOR_OFF_PEAK_RATE = 30;

/**
 * Gets the appropriate hourly rate based on membership tier, date, and time.
 * 
 * Visitor rates:
 *   - Peak: $35/hr
 *   - Off-peak: $30/hr
 * 
 * Weekday Member:
 *   - Weekdays before 4pm: member rate
 *   - Other times: Visitor peak rate ($35/hr)
 * 
 * Birdie Member: member rate (anytime)
 * Eagle Member: member rate (anytime)
 */
export function calculateHourlyRate(
  tier: string,
  date: Date,
  startTime: string,
  tierPricing: Record<string, number>,
  options?: { segment?: string | null; holidaySurchargePercent?: number }
): number {
  const isPeak = isPeakTime(date, startTime);
  
  let baseRate: number;

  // Staff get free play during off-peak, full visitor rate during peak
  if (options?.segment === "staff") {
    baseRate = isPeak ? VISITOR_PEAK_RATE : 0;
  } else {
    switch (tier.toLowerCase()) {
      case "visitor":
        baseRate = isPeak ? VISITOR_PEAK_RATE : VISITOR_OFF_PEAK_RATE;
        break;
      case "weekday":
        // Weekday members pay their rate for off-peak weekday slots
        // Otherwise they pay visitor peak rate
        baseRate = isWeekdayMemberTime(date, startTime) 
          ? (tierPricing.weekday || 10) 
          : VISITOR_PEAK_RATE;
        break;
      case "birdie":
        baseRate = tierPricing.birdie || 10;
        break;
      case "eagle":
        baseRate = tierPricing.eagle || 8;
        break;
      default:
        // Unknown tier defaults to peak visitor rate
        baseRate = VISITOR_PEAK_RATE;
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
