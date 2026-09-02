import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Local comp handicaps: plus handicaps (better than scratch) are stored as
 * negatives, SGT-style. Display them golf-convention: -1 stored shows "+1".
 */
export function formatLocalHcp(hcp: number | null | undefined): string {
  const v = Number(hcp) || 0;
  const abs = Math.abs(v);
  const str = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return v < 0 ? `+${str}` : str;
}

export const AMBROSE_GAP_THRESHOLD = 8;

/**
 * 2-person Ambrose combined handicap: (h1 + h2) / 4, with the common
 * Australian club gap rule applied — if the partners' handicaps differ by
 * more than AMBROSE_GAP_THRESHOLD, deduct 1 extra stroke from the team.
 */
export function combinedAmbroseHcp(h1: number, h2: number): number {
  const base = (h1 + h2) / 4;
  return Math.abs(h1 - h2) > AMBROSE_GAP_THRESHOLD ? base - 1 : base;
}
