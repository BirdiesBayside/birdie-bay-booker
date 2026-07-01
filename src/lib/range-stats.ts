// Utilities for range shot statistics (client-side).

export type Shot = {
  id: string;
  session_id: string;
  shot_number: number | null;
  club_type: string | null;
  ball_speed: number | null;
  club_speed: number | null;
  smash_factor: number | null;
  launch_angle: number | null;
  launch_direction: number | null;
  spin_rate: number | null;
  spin_axis: number | null;
  back_spin: number | null;
  side_spin: number | null;
  carry: number | null;
  total: number | null;
  side_carry: number | null;
  side_total: number | null;
  apex_height: number | null;
  descent_angle: number | null;
  angle_of_attack: number | null;
  club_path: number | null;
  face_angle: number | null;
  face_to_path: number | null;
  shot_timestamp: string | null;
};

// Canonical club ordering (long -> short)
const CLUB_ORDER = [
  "Dr", "Driver", "3W", "5W", "7W", "2H", "3H", "4H", "5H",
  "2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i",
  "PW", "GW", "AW", "SW", "LW", "P",
];

export function sortClubs(clubs: string[]): string[] {
  const idx = (c: string) => {
    const i = CLUB_ORDER.findIndex((n) => n.toLowerCase() === c.toLowerCase());
    return i === -1 ? 999 : i;
  };
  return [...clubs].sort((a, b) => idx(a) - idx(b) || a.localeCompare(b));
}

const nums = (arr: (number | null | undefined)[]): number[] =>
  arr.filter((v): v is number => typeof v === "number" && Number.isFinite(v));

export function mean(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr);
  if (n.length === 0) return null;
  return n.reduce((a, b) => a + b, 0) / n.length;
}

export function max(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr);
  return n.length === 0 ? null : Math.max(...n);
}

export function stddev(arr: (number | null | undefined)[]): number | null {
  const n = nums(arr);
  if (n.length < 2) return null;
  const m = n.reduce((a, b) => a + b, 0) / n.length;
  const v = n.reduce((a, b) => a + (b - m) ** 2, 0) / (n.length - 1);
  return Math.sqrt(v);
}

export type ClubStats = {
  club: string;
  shots: number;
  avgCarry: number | null;
  maxCarry: number | null;
  avgTotal: number | null;
  maxTotal: number | null;
  avgBallSpeed: number | null;
  avgClubSpeed: number | null;
  avgSmash: number | null;
  avgLaunch: number | null;
  avgSpin: number | null;
  lateralSd: number | null; // dispersion (side carry stddev)
  smashSd: number | null;   // consistency
};

export function statsByClub(shots: Shot[]): ClubStats[] {
  const groups = new Map<string, Shot[]>();
  for (const s of shots) {
    const club = s.club_type || "Unknown";
    const arr = groups.get(club) ?? [];
    arr.push(s);
    groups.set(club, arr);
  }
  const clubs = sortClubs(Array.from(groups.keys()));
  return clubs.map((club) => {
    const g = groups.get(club)!;
    return {
      club,
      shots: g.length,
      avgCarry: mean(g.map((s) => s.carry)),
      maxCarry: max(g.map((s) => s.carry)),
      avgTotal: mean(g.map((s) => s.total)),
      maxTotal: max(g.map((s) => s.total)),
      avgBallSpeed: mean(g.map((s) => s.ball_speed)),
      avgClubSpeed: mean(g.map((s) => s.club_speed)),
      avgSmash: mean(g.map((s) => s.smash_factor)),
      avgLaunch: mean(g.map((s) => s.launch_angle)),
      avgSpin: mean(g.map((s) => s.spin_rate)),
      lateralSd: stddev(g.map((s) => s.side_carry ?? s.side_total)),
      smashSd: stddev(g.map((s) => s.smash_factor)),
    };
  });
}

export function fmt(n: number | null | undefined, digits = 1, suffix = ""): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}
