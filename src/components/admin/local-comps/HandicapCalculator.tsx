import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Simple Average Handicap Calculator
 * 
 * Formula: Handicap = Average Score - Course Par
 * 
 * This gives a rough estimate of how many strokes over par
 * a golfer typically plays.
 */
export function HandicapCalculator() {
  const [averageScore, setAverageScore] = useState("97");
  const [coursePar, setCoursePar] = useState("72");
  const [calculated, setCalculated] = useState(false);

  const result = useMemo(() => {
    const score = parseFloat(averageScore);
    const par = parseFloat(coursePar);
    if (!score || !par) return null;

    // Simple handicap calculation
    const handicap = score - par;

    return {
      handicap,
      overPar: handicap,
    };
  }, [averageScore, coursePar]);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold">Handicap Calculator</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Quick estimate based on average score vs course par.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calculator className="h-5 w-5" />
            Calculate Handicap
          </CardTitle>
          <CardDescription>
            Enter the player's average score and course par to estimate their handicap.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Average Score</Label>
              <Input
                type="number"
                value={averageScore}
                onChange={(e) => setAverageScore(e.target.value)}
                placeholder="e.g. 97"
              />
            </div>
            <div>
              <Label>Course Par</Label>
              <Input
                type="number"
                value={coursePar}
                onChange={(e) => setCoursePar(e.target.value)}
                placeholder="e.g. 72"
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
              <div className="bg-primary/10 rounded-lg p-4 border border-primary/30">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Estimated Handicap</p>
                <p className="text-3xl font-bold mt-1 text-primary">{result.handicap > 0 ? `+${result.handicap}` : result.handicap}</p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Over Par</p>
                <p className="text-2xl font-bold mt-1">+{result.overPar}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Simple formula: <strong>Handicap = Average Score − Course Par</strong>. 
          This gives a rough estimate of strokes over par. For example, averaging 97 on a par-72 course ≈ 25 handicap.
        </AlertDescription>
      </Alert>
    </div>
  );
}