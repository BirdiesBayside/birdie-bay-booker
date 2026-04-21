import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Golf Australia Handicap Calculator
 *
 * Method:
 *   Score Differential = (Adjusted Gross Score − Course Rating) × 113 / Slope Rating
 *   Handicap Index ≈ average of best 8 of last 20 differentials × 0.93 (soft cap factor)
 *
 * For a quick estimate from an "average score" we treat all rounds as the same value
 * (as requested), so the average-of-best-8 simplifies to that single differential.
 * We then apply the 0.93 multiplier used by Golf Australia / WHS to soften the index.
 */
export function HandicapCalculator() {
  const [averageScore, setAverageScore] = useState("97");
  const [par, setPar] = useState("72");
  const [courseRating, setCourseRating] = useState("72");
  const [slopeRating, setSlopeRating] = useState("113");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo(() => {
    const score = parseFloat(averageScore);
    const cr = parseFloat(courseRating);
    const slope = parseFloat(slopeRating);
    const parVal = parseFloat(par);
    if (!score || !cr || !slope || !parVal) return null;

    // GA / WHS Score Differential
    const differential = ((score - cr) * 113) / slope;
    // Soft-cap factor (best 8 of 20 averaged then × 0.93)
    const handicapIndex = differential * 0.93;
    // Daily handicap on a course with this slope
    const dailyHandicap = Math.round((handicapIndex * slope) / 113);
    // Vs par
    const overPar = score - parVal;

    return {
      differential: differential.toFixed(1),
      handicapIndex: handicapIndex.toFixed(1),
      dailyHandicap,
      overPar,
    };
  }, [averageScore, par, courseRating, slopeRating]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Handicap Calculator</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Estimate a player's handicap using Golf Australia / WHS methodology.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5" />
            Calculate Handicap
          </CardTitle>
          <CardDescription>
            Enter the player's average score. Defaults assume a par-72 course of standard rating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Average Score (best 7 rounds)</Label>
            <Input
              type="number"
              value={averageScore}
              onChange={(e) => setAverageScore(e.target.value)}
              placeholder="e.g. 97"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Course Par</Label>
              <Input
                type="number"
                value={par}
                onChange={(e) => setPar(e.target.value)}
              />
            </div>
            <div>
              <Label>Course Rating</Label>
              <Input
                type="number"
                step="0.1"
                value={courseRating}
                onChange={(e) => setCourseRating(e.target.value)}
              />
            </div>
            <div>
              <Label>Slope Rating</Label>
              <Input
                type="number"
                value={slopeRating}
                onChange={(e) => setSlopeRating(e.target.value)}
              />
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => setCalculated(true)}
            disabled={!result}
          >
            Calculate
          </Button>

          {calculated && result && (
            <div className="grid grid-cols-2 gap-3 pt-4 border-t">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Score Differential</p>
                <p className="text-2xl font-bold mt-1">{result.differential}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Over Par</p>
                <p className="text-2xl font-bold mt-1">+{result.overPar}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-4 border border-primary/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Handicap Index</p>
                <p className="text-3xl font-bold mt-1 text-primary">{result.handicapIndex}</p>
              </div>
              <div className="bg-primary/10 rounded-lg p-4 border border-primary/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Daily Handicap</p>
                <p className="text-3xl font-bold mt-1 text-primary">{result.dailyHandicap}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Formula: <strong>Differential = (Score − Course Rating) × 113 / Slope</strong>, then
          Handicap Index = Differential × 0.93 (Golf Australia soft-cap multiplier for best 8 of 20).
          Daily Handicap = Index × Slope ÷ 113. For an average shooter on a standard par-72 course
          (CR 72, Slope 113), an average of 97 ≈ a handicap of ~23.
        </AlertDescription>
      </Alert>
    </div>
  );
}
