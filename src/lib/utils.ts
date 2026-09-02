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
