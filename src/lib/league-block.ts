/**
 * League "Monthly Winner" 4-week block model.
 *
 * Rule:
 *  - Anchor: Sunday 1 March 2026 (Brisbane) = start of Block 0.
 *  - Each block = exactly 4 consecutive weekly tournaments (Sunday starts).
 *  - A tournament's block is determined by its start_date only.
 *  - A block's display label = the calendar month containing its
 *    midpoint Sunday (block start + 1 week). e.g. block starting
 *    Apr 26 -> midpoint May 3 -> "May 2026".
 *
 * No timezone math required: we compare calendar dates only.
 */

const ANCHOR_ISO = "2026-03-01"; // Sunday
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

function parseDateOnly(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getFullYear(), input.getMonth(), input.getDate()));
  }
  // Accept "YYYY-MM-DD" or full ISO strings; only the date portion matters.
  const ymd = input.slice(0, 10);
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

const ANCHOR = parseDateOnly(ANCHOR_ISO);

/** Return the most recent Sunday on or before the given date (UTC date math). */
function snapToSunday(d: Date): Date {
  // Date.UTC day: 0 = Sunday
  const day = d.getUTCDay();
  return new Date(d.getTime() - day * MS_PER_DAY);
}

/**
 * Compute block index (0, 1, 2…) for a tournament start date.
 * Dates before the anchor return null (no block — pre-model).
 */
export function getBlockIndex(tournamentStart: string | Date): number | null {
  const start = snapToSunday(parseDateOnly(tournamentStart));
  const diffMs = start.getTime() - ANCHOR.getTime();
  if (diffMs < 0) return null;
  const weeksSinceAnchor = Math.floor(diffMs / MS_PER_WEEK);
  return Math.floor(weeksSinceAnchor / 4);
}

/** Return the Sunday that starts a given block. */
export function getBlockStartDate(blockIndex: number): Date {
  return new Date(ANCHOR.getTime() + blockIndex * 4 * MS_PER_WEEK);
}

/** Midpoint Sunday = block start + 1 week (the 2nd of the 4 Sundays). */
export function getBlockMidpoint(blockIndex: number): Date {
  return new Date(getBlockStartDate(blockIndex).getTime() + MS_PER_WEEK);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "May 2026" — month containing the block's midpoint Sunday. */
export function getBlockLabel(blockIndex: number): string {
  const mid = getBlockMidpoint(blockIndex);
  return `${MONTH_NAMES[mid.getUTCMonth()]} ${mid.getUTCFullYear()}`;
}

/** Convenience: block label for a given tournament start date. */
export function getBlockLabelForDate(tournamentStart: string | Date): string | null {
  const idx = getBlockIndex(tournamentStart);
  if (idx === null) return null;
  return getBlockLabel(idx);
}

/**
 * Block label for "now" — i.e. the block that contains the current (or
 * most recent) Sunday tournament. Used by leaderboards to show the
 * currently-active monthly winner period.
 */
export function getCurrentBlockLabel(now: Date = new Date()): string {
  // Snap "now" back to its Sunday so a Mon–Sat view still maps to the
  // tournament that started that week.
  const sunday = snapToSunday(parseDateOnly(now));
  const diffMs = sunday.getTime() - ANCHOR.getTime();
  const weeksSinceAnchor = Math.max(0, Math.floor(diffMs / MS_PER_WEEK));
  const idx = Math.floor(weeksSinceAnchor / 4);
  return getBlockLabel(idx);
}

/** List the most recent N block labels, newest first, not exceeding "now". */
export function getRecentBlockLabels(count: number, now: Date = new Date()): string[] {
  const sunday = snapToSunday(parseDateOnly(now));
  const diffMs = sunday.getTime() - ANCHOR.getTime();
  const weeksSinceAnchor = Math.max(0, Math.floor(diffMs / MS_PER_WEEK));
  const currentIdx = Math.floor(weeksSinceAnchor / 4);
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const idx = currentIdx - i;
    if (idx < 0) break;
    labels.push(getBlockLabel(idx));
  }
  return labels;
}
