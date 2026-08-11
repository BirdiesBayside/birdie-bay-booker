import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RevenueGranularity = "day" | "week" | "month" | "quarter" | "half" | "year";

export interface RevenueTrendPoint {
  label: string;
  bookings: number;
  pos: number;
  memberships: number;
  total: number;
}

const BRISBANE_OFFSET_MS = 10 * 60 * 60 * 1000; // AEST (UTC+10), no DST

/** Convert an instant into Brisbane-local calendar parts */
function brisbaneParts(iso: string) {
  const d = new Date(new Date(iso).getTime() + BRISBANE_OFFSET_MS);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth(), // 0-11
    d: d.getUTCDate(),
    time: d.getTime(),
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Returns bucket key + label for an instant, given granularity */
function bucketFor(iso: string, granularity: RevenueGranularity): { key: string; label: string } | null {
  const p = brisbaneParts(iso);
  switch (granularity) {
    case "day": {
      const key = `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
      return { key, label: `${p.d} ${MONTHS[p.m]}` };
    }
    case "week": {
      // Monday-start week key
      const dayMs = 86400000;
      const utc = Date.UTC(p.y, p.m, p.d);
      const dow = new Date(utc).getUTCDay(); // 0 Sun
      const offset = (dow + 6) % 7;
      const monday = new Date(utc - offset * dayMs);
      const key = monday.toISOString().slice(0, 10);
      return { key, label: `${monday.getUTCDate()} ${MONTHS[monday.getUTCMonth()]}` };
    }
    case "month": {
      const key = `${p.y}-${String(p.m + 1).padStart(2, "0")}`;
      return { key, label: `${MONTHS[p.m]} ${String(p.y).slice(2)}` };
    }
    case "quarter": {
      const q = Math.floor(p.m / 3) + 1;
      return { key: `${p.y}-Q${q}`, label: `Q${q} ${String(p.y).slice(2)}` };
    }
    case "half": {
      const h = p.m < 6 ? 1 : 2;
      return { key: `${p.y}-H${h}`, label: `H${h} ${String(p.y).slice(2)}` };
    }
    case "year":
      return { key: `${p.y}`, label: `${p.y}` };
  }
}

function startOfDayBrisbane(date: Date): Date {
  const parts = brisbaneParts(date.toISOString());
  return new Date(Date.UTC(parts.y, parts.m, parts.d, 0, 0, 0) - BRISBANE_OFFSET_MS);
}

function endOfDayBrisbane(date: Date): Date {
  const parts = brisbaneParts(date.toISOString());
  return new Date(Date.UTC(parts.y, parts.m, parts.d, 23, 59, 59, 999) - BRISBANE_OFFSET_MS);
}

/** Build ordered buckets between start and end (inclusive) for the chosen granularity */
function buildBuckets(
  startDate: Date,
  endDate: Date,
  granularity: RevenueGranularity
): { key: string; label: string }[] {
  const start = startOfDayBrisbane(startDate);
  const end = endOfDayBrisbane(endDate);
  const out: { key: string; label: string }[] = [];
  const seen = new Set<string>();

  let current = new Date(start.getTime());
  while (current.getTime() <= end.getTime()) {
    const b = bucketFor(current.toISOString(), granularity);
    if (b && !seen.has(b.key)) {
      seen.add(b.key);
      out.push(b);
    }

    // Advance by one bucket
    const p = brisbaneParts(current.toISOString());
    switch (granularity) {
      case "day":
        current = new Date(Date.UTC(p.y, p.m, p.d + 1) - BRISBANE_OFFSET_MS);
        break;
      case "week":
        current = new Date(Date.UTC(p.y, p.m, p.d + 7) - BRISBANE_OFFSET_MS);
        break;
      case "month":
        current = new Date(Date.UTC(p.y, p.m + 1, 1) - BRISBANE_OFFSET_MS);
        break;
      case "quarter":
        current = new Date(Date.UTC(p.y, p.m + 3, 1) - BRISBANE_OFFSET_MS);
        break;
      case "half":
        current = new Date(Date.UTC(p.y, p.m + 6, 1) - BRISBANE_OFFSET_MS);
        break;
      case "year":
        current = new Date(Date.UTC(p.y + 1, 0, 1) - BRISBANE_OFFSET_MS);
        break;
    }
  }

  return out;
}

async function fetchAllRows(queryFn: (from: number, to: number) => any): Promise<any[]> {
  const batchSize = 1000;
  let allRows: any[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await queryFn(from, from + batchSize - 1);
    if (error) throw error;
    if (data) {
      allRows = allRows.concat(data);
      hasMore = data.length === batchSize;
      from += batchSize;
    } else {
      hasMore = false;
    }
  }
  return allRows;
}

export interface UseRevenueTrendOptions {
  granularity: RevenueGranularity;
  startDate: Date;
  endDate: Date;
}

export function useRevenueTrend({ granularity, startDate, endDate }: UseRevenueTrendOptions) {
  return useQuery({
    queryKey: ["revenue-trend", granularity, startDate.toISOString(), endDate.toISOString()],
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<RevenueTrendPoint[]> => {
      const start = startOfDayBrisbane(startDate).toISOString();
      const end = endOfDayBrisbane(endDate).toISOString();

      const [bookings, pos, memberships] = await Promise.all([
        fetchAllRows((from, to) =>
          supabase
            .from("bookings")
            .select("created_at, total_price, status")
            .neq("status", "cancelled")
            .gte("created_at", start)
            .lte("created_at", end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase
            .from("pos_transactions")
            .select("created_at, total")
            .gte("created_at", start)
            .lte("created_at", end)
            .range(from, to)
        ),
        fetchAllRows((from, to) =>
          supabase
            .from("membership_payments")
            .select("paid_at, amount")
            .gte("paid_at", start)
            .lte("paid_at", end)
            .range(from, to)
        ),
      ]);

      const buckets = buildBuckets(startDate, endDate, granularity);
      const map = new Map<string, RevenueTrendPoint>();
      buckets.forEach((b) =>
        map.set(b.key, { label: b.label, bookings: 0, pos: 0, memberships: 0, total: 0 })
      );

      const add = (iso: string | null, amount: number, field: "bookings" | "pos" | "memberships") => {
        if (!iso || !amount) return;
        const b = bucketFor(iso, granularity);
        if (!b) return;
        const row = map.get(b.key);
        if (!row) return; // outside selected range
        row[field] += amount;
        row.total += amount;
      };

      bookings.forEach((b) => add(b.created_at, Number(b.total_price) || 0, "bookings"));
      pos.forEach((t) => add(t.created_at, Number(t.total) || 0, "pos"));
      memberships.forEach((p) => add(p.paid_at, Number(p.amount) || 0, "memberships"));

      return buckets.map((b) => {
        const r = map.get(b.key)!;
        return {
          label: r.label,
          bookings: Math.round(r.bookings),
          pos: Math.round(r.pos),
          memberships: Math.round(r.memberships),
          total: Math.round(r.total),
        };
      });
    },
  });
}
