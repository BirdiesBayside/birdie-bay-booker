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
  tierPricing: Record<string, number>
): number {
  const isPeak = isPeakTime(date, startTime);
  
  switch (tier.toLowerCase()) {
    case "visitor":
      return isPeak ? VISITOR_PEAK_RATE : VISITOR_OFF_PEAK_RATE;
    
    case "weekday":
      // Weekday members pay their rate for off-peak weekday slots
      // Otherwise they pay visitor peak rate
      return isWeekdayMemberTime(date, startTime) 
        ? (tierPricing.weekday || 10) 
        : VISITOR_PEAK_RATE;
    
    case "birdie":
      return tierPricing.birdie || 10;
    
    case "eagle":
      return tierPricing.eagle || 8;
    
    default:
      // Unknown tier defaults to peak visitor rate
      return VISITOR_PEAK_RATE;
  }
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
