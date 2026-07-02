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

/** Normalize a player-side club label to one of the tour rows. Returns null when unknown. */
export function matchTourClub(club: string): TourAverage | null {
  const c = (club || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const lookups: [RegExp, string][] = [
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

  for (const [re, name] of lookups) {
    if (re.test(c)) return PGA_TOUR_AVERAGES.find((t) => t.club === name) ?? null;
  }
  return null;
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
