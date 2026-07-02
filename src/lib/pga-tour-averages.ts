// PGA Tour averages by club, sourced from Trackman's published tour data
// (https://blog.trackmangolf.com/trackman-average-tour-stats/).
// Distances are yards, speeds mph. Convert with existing helpers before comparing.

export type TourAverage = {
  club: string;              // canonical club label
  clubSpeedMph: number;      // club head speed
  ballSpeedMph: number;      // ball speed
  smashFactor: number;       // ball / club
  launchAngleDeg: number;    // launch angle
  spinRpm: number;           // backspin
  carryYd: number;           // carry distance
  aoaDeg: number;            // angle of attack (positive = up)
};

// Curated from Trackman PGA Tour averages.
export const PGA_TOUR_AVERAGES: TourAverage[] = [
  { club: "Driver",  clubSpeedMph: 113, ballSpeedMph: 167, smashFactor: 1.48, launchAngleDeg: 10.9, spinRpm: 2686, carryYd: 275, aoaDeg: -1.3 },
  { club: "3 Wood",  clubSpeedMph: 107, ballSpeedMph: 158, smashFactor: 1.48, launchAngleDeg: 9.2,  spinRpm: 3655, carryYd: 243, aoaDeg: -2.9 },
  { club: "5 Wood",  clubSpeedMph: 103, ballSpeedMph: 152, smashFactor: 1.47, launchAngleDeg: 9.4,  spinRpm: 4350, carryYd: 230, aoaDeg: -3.3 },
  { club: "Hybrid",  clubSpeedMph: 100, ballSpeedMph: 146, smashFactor: 1.46, launchAngleDeg: 10.2, spinRpm: 4437, carryYd: 225, aoaDeg: -2.5 },
  { club: "3 Iron",  clubSpeedMph:  98, ballSpeedMph: 142, smashFactor: 1.45, launchAngleDeg: 10.4, spinRpm: 4630, carryYd: 212, aoaDeg: -3.1 },
  { club: "4 Iron",  clubSpeedMph:  96, ballSpeedMph: 137, smashFactor: 1.43, launchAngleDeg: 11.0, spinRpm: 4836, carryYd: 203, aoaDeg: -3.4 },
  { club: "5 Iron",  clubSpeedMph:  94, ballSpeedMph: 132, smashFactor: 1.41, launchAngleDeg: 12.1, spinRpm: 5361, carryYd: 194, aoaDeg: -3.7 },
  { club: "6 Iron",  clubSpeedMph:  92, ballSpeedMph: 127, smashFactor: 1.38, launchAngleDeg: 14.1, spinRpm: 6231, carryYd: 183, aoaDeg: -4.1 },
  { club: "7 Iron",  clubSpeedMph:  90, ballSpeedMph: 120, smashFactor: 1.33, launchAngleDeg: 16.3, spinRpm: 7097, carryYd: 172, aoaDeg: -4.3 },
  { club: "8 Iron",  clubSpeedMph:  87, ballSpeedMph: 115, smashFactor: 1.32, launchAngleDeg: 18.1, spinRpm: 7998, carryYd: 160, aoaDeg: -4.5 },
  { club: "9 Iron",  clubSpeedMph:  85, ballSpeedMph: 109, smashFactor: 1.28, launchAngleDeg: 20.4, spinRpm: 8647, carryYd: 148, aoaDeg: -4.7 },
  { club: "PW",      clubSpeedMph:  83, ballSpeedMph: 102, smashFactor: 1.23, launchAngleDeg: 24.2, spinRpm: 9304, carryYd: 136, aoaDeg: -5.0 },
];

// Trackman "Average Golfer" — published averages for an average amateur male
// (roughly 14–15 handicap). Source: Trackman range studies aggregated across
// club-fitting sessions. Same units and shape as PGA_TOUR_AVERAGES so any
// consumer can swap between them.
export const AMATEUR_AVERAGES: TourAverage[] = [
  { club: "Driver",  clubSpeedMph:  93, ballSpeedMph: 133, smashFactor: 1.42, launchAngleDeg: 12.6, spinRpm: 3275, carryYd: 216, aoaDeg: -0.1 },
  { club: "3 Wood",  clubSpeedMph:  90, ballSpeedMph: 128, smashFactor: 1.42, launchAngleDeg: 11.2, spinRpm: 3400, carryYd: 195, aoaDeg: -2.0 },
  { club: "5 Wood",  clubSpeedMph:  88, ballSpeedMph: 124, smashFactor: 1.41, launchAngleDeg: 12.0, spinRpm: 4000, carryYd: 185, aoaDeg: -2.3 },
  { club: "Hybrid",  clubSpeedMph:  86, ballSpeedMph: 119, smashFactor: 1.38, launchAngleDeg: 12.5, spinRpm: 4300, carryYd: 175, aoaDeg: -1.7 },
  { club: "3 Iron",  clubSpeedMph:  84, ballSpeedMph: 115, smashFactor: 1.37, launchAngleDeg: 13.7, spinRpm: 4300, carryYd: 168, aoaDeg: -2.0 },
  { club: "4 Iron",  clubSpeedMph:  82, ballSpeedMph: 112, smashFactor: 1.37, launchAngleDeg: 15.0, spinRpm: 4600, carryYd: 161, aoaDeg: -2.3 },
  { club: "5 Iron",  clubSpeedMph:  80, ballSpeedMph: 108, smashFactor: 1.35, launchAngleDeg: 16.0, spinRpm: 5100, carryYd: 152, aoaDeg: -2.6 },
  { club: "6 Iron",  clubSpeedMph:  78, ballSpeedMph: 104, smashFactor: 1.33, launchAngleDeg: 17.5, spinRpm: 5700, carryYd: 143, aoaDeg: -3.1 },
  { club: "7 Iron",  clubSpeedMph:  75, ballSpeedMph:  98, smashFactor: 1.30, launchAngleDeg: 19.0, spinRpm: 6500, carryYd: 133, aoaDeg: -3.4 },
  { club: "8 Iron",  clubSpeedMph:  72, ballSpeedMph:  93, smashFactor: 1.29, launchAngleDeg: 20.5, spinRpm: 7200, carryYd: 123, aoaDeg: -3.7 },
  { club: "9 Iron",  clubSpeedMph:  69, ballSpeedMph:  87, smashFactor: 1.26, launchAngleDeg: 22.6, spinRpm: 7900, carryYd: 112, aoaDeg: -4.0 },
  { club: "PW",      clubSpeedMph:  65, ballSpeedMph:  79, smashFactor: 1.22, launchAngleDeg: 25.6, spinRpm: 8400, carryYd:  97, aoaDeg: -4.4 },
];

export type BenchmarkSet = "tour" | "amateur";

export const BENCHMARK_LABELS: Record<BenchmarkSet, string> = {
  tour: "PGA Tour",
  amateur: "Average Golfer",
};

const CLUB_LOOKUPS: [RegExp, string][] = [
  [/^driver$|^dr$|^1w$/, "Driver"],
  [/^3w$|^w3$|3wood/, "3 Wood"],
  [/^5w$|^w5$|5wood/, "5 Wood"],
  [/hybrid|^h[0-9]?$|^[0-9]h$/, "Hybrid"],
  [/^3i$|^i3$|3iron/, "3 Iron"],
  [/^4i$|^i4$|4iron/, "4 Iron"],
  [/^5i$|^i5$|5iron/, "5 Iron"],
  [/^6i$|^i6$|6iron/, "6 Iron"],
  [/^7i$|^i7$|7iron/, "7 Iron"],
  [/^8i$|^i8$|8iron/, "8 Iron"],
  [/^9i$|^i9$|9iron/, "9 Iron"],
  [/^pw$|pitching/, "PW"],
];

/** Normalize a player-side club label to one of the benchmark rows. */
export function matchBenchmarkClub(club: string, set: BenchmarkSet = "tour"): TourAverage | null {
  const c = (club || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const table = set === "amateur" ? AMATEUR_AVERAGES : PGA_TOUR_AVERAGES;
  for (const [re, name] of CLUB_LOOKUPS) {
    if (re.test(c)) return table.find((t) => t.club === name) ?? null;
  }
  return null;
}

/** Backwards-compatible alias — always matches the PGA Tour dataset. */
export function matchTourClub(club: string): TourAverage | null {
  return matchBenchmarkClub(club, "tour");
}

export const METRIC_TOOLTIPS: Record<string, string> = {
  clubSpeed:
    "How fast the club head is moving at impact. More speed = more potential distance. Tour drivers swing around 113 mph.",
  ballSpeed:
    "The speed of the ball right after impact. It's the single biggest driver of distance — every 1 mph of ball speed is roughly 2 yards of carry.",
  smashFactor:
    "Ball speed divided by club speed — a measure of strike quality. 1.50 is the practical max with a driver; irons drop as loft increases.",
  launchAngle:
    "The angle the ball leaves the club face. Too low with a driver = you lose carry; too high with a wedge = you lose distance and control.",
  spin:
    "Backspin in RPM. Too much spin balloons the ball, too little and it falls out of the sky. Each club has an optimal window.",
  carry:
    "How far the ball flies through the air before it lands. This is the number that actually matters for clearing hazards.",
  aoa:
    "Angle of Attack — whether the club is moving up (+) or down (−) at impact. Tour players hit up on the driver and down on irons.",
};
