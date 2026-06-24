/**
 * League "Monthly Winner", calendar-month model.
 *
 * Rule:
 *  - A tournament belongs to the calendar month of its *play day* in
 *    Brisbane (Monday). Because we pad SGT tournaments by one day at
 *    each end to accommodate the US timezone, the stored `start_date`
 *    is the Sunday before the Monday play day. We therefore bucket
 *    by `start_date + 1 day`.
 *  - Label = "<MonthName> <Year>", e.g. "June 2026".
 *
 * The legacy 4-week "block" model and the " (Late)" suffix have been
 * removed. Helper names are kept so existing callers continue to work.
 */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function parseDateOnly(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  }
  const ymd = input.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function labelFor(year: number, monthIdx: number): string {
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

/** Calendar-month label for a given tournament start date (shifted +1 day to the Brisbane play day). */
export function getBlockLabelForDate(tournamentStart: string | Date): string {
  const d = parseDateOnly(tournamentStart);
  d.setUTCDate(d.getUTCDate() + 1);
  return labelFor(d.getUTCFullYear(), d.getUTCMonth());
}

/** Calendar-month label for "now" (current month). */
export function getCurrentBlockLabel(now: Date = new Date()): string {
  const d = parseDateOnly(now);
  return labelFor(d.getUTCFullYear(), d.getUTCMonth());
}

/** Most recent N calendar-month labels, newest first. */
export function getRecentBlockLabels(count: number, now: Date = new Date()): string[] {
  const d = parseDateOnly(now);
  let year = d.getUTCFullYear();
  let month = d.getUTCMonth();
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    labels.push(labelFor(year, month));
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
  }
  return labels;
}
