import { Scorecard } from "@/lib/sgt-api";
import { cn } from "@/lib/utils";

interface ScorecardDisplayProps {
  scorecard: Scorecard;
  showDetails?: boolean;
}

function getScoreClass(score: number, par: number): string {
  const diff = score - par;
  if (score === 0) return "bg-muted text-muted-foreground";
  if (diff <= -2) return "score-eagle";
  if (diff === -1) return "score-birdie";
  if (diff === 0) return "score-par";
  if (diff === 1) return "score-bogey";
  return "score-double";
}

function formatToPar(toPar: number): string {
  if (toPar === 0) return "E";
  if (toPar > 0) return `+${toPar}`;
  return toPar.toString();
}

export function ScorecardDisplay({ scorecard, showDetails = false }: ScorecardDisplayProps) {
  const holes = Array.from({ length: 18 }, (_, i) => i + 1);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 text-sm font-inter">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Gross:</span>
          <span className="font-semibold text-foreground">{scorecard.total_gross}</span>
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            scorecard.toPar_gross <= 0 ? "bg-birdie/20 text-birdie" : "bg-bogey/20 text-bogey"
          )}>
            {formatToPar(scorecard.toPar_gross)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Net:</span>
          <span className="font-semibold text-foreground">{scorecard.total_net}</span>
          <span className={cn(
            "px-2 py-0.5 rounded text-xs font-medium",
            scorecard.toPar_net <= 0 ? "bg-birdie/20 text-birdie" : "bg-bogey/20 text-bogey"
          )}>
            {formatToPar(scorecard.toPar_net)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">HCP:</span>
          <span className="font-semibold text-foreground">{scorecard.hcp_index}</span>
        </div>
      </div>

      {/* Detailed Scorecard */}
      {showDetails && scorecard.holeData && (
        <div className="overflow-x-auto">
          {/* Front 9 */}
          <div className="min-w-[600px]">
            <div className="grid grid-cols-11 gap-1 text-xs font-inter mb-2">
              <div className="font-medium text-muted-foreground">Hole</div>
              {holes.slice(0, 9).map(h => (
                <div key={h} className="text-center font-medium text-muted-foreground">{h}</div>
              ))}
              <div className="text-center font-medium text-muted-foreground">OUT</div>
            </div>
            <div className="grid grid-cols-11 gap-1 text-xs font-inter mb-1">
              <div className="text-muted-foreground">Par</div>
              {holes.slice(0, 9).map(h => {
                const par = scorecard.holeData?.[`h${h}_Par`] as number;
                return (
                  <div key={h} className="text-center text-muted-foreground">{par || '-'}</div>
                );
              })}
              <div className="text-center font-medium text-muted-foreground">
                {holes.slice(0, 9).reduce((sum, h) => sum + ((scorecard.holeData?.[`h${h}_Par`] as number) || 0), 0)}
              </div>
            </div>
            <div className="grid grid-cols-11 gap-1 text-xs font-inter">
              <div className="text-foreground font-medium">Score</div>
              {holes.slice(0, 9).map(h => {
                const par = scorecard.holeData?.[`h${h}_Par`] as number;
                const gross = scorecard.holeData?.[`hole${h}_gross`] as number;
                return (
                  <div
                    key={h}
                    className={cn(
                      "text-center py-1 rounded font-medium",
                      getScoreClass(gross || 0, par || 0)
                    )}
                  >
                    {gross || '-'}
                  </div>
                );
              })}
              <div className="text-center font-bold text-foreground py-1">
                {scorecard.out_gross}
              </div>
            </div>
          </div>

          {/* Back 9 */}
          <div className="min-w-[600px] mt-4">
            <div className="grid grid-cols-11 gap-1 text-xs font-inter mb-2">
              <div className="font-medium text-muted-foreground">Hole</div>
              {holes.slice(9, 18).map(h => (
                <div key={h} className="text-center font-medium text-muted-foreground">{h}</div>
              ))}
              <div className="text-center font-medium text-muted-foreground">IN</div>
            </div>
            <div className="grid grid-cols-11 gap-1 text-xs font-inter mb-1">
              <div className="text-muted-foreground">Par</div>
              {holes.slice(9, 18).map(h => {
                const par = scorecard.holeData?.[`h${h}_Par`] as number;
                return (
                  <div key={h} className="text-center text-muted-foreground">{par || '-'}</div>
                );
              })}
              <div className="text-center font-medium text-muted-foreground">
                {holes.slice(9, 18).reduce((sum, h) => sum + ((scorecard.holeData?.[`h${h}_Par`] as number) || 0), 0)}
              </div>
            </div>
            <div className="grid grid-cols-11 gap-1 text-xs font-inter">
              <div className="text-foreground font-medium">Score</div>
              {holes.slice(9, 18).map(h => {
                const par = scorecard.holeData?.[`h${h}_Par`] as number;
                const gross = scorecard.holeData?.[`hole${h}_gross`] as number;
                return (
                  <div
                    key={h}
                    className={cn(
                      "text-center py-1 rounded font-medium",
                      getScoreClass(gross || 0, par || 0)
                    )}
                  >
                    {gross || '-'}
                  </div>
                );
              })}
              <div className="text-center font-bold text-foreground py-1">
                {scorecard.in_gross}
              </div>
            </div>
          </div>

          {/* Score Legend */}
          <div className="flex flex-wrap gap-3 mt-4 text-xs font-inter">
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded score-eagle"></div>
              <span className="text-muted-foreground">Eagle+</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded score-birdie"></div>
              <span className="text-muted-foreground">Birdie</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded score-par"></div>
              <span className="text-muted-foreground">Par</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded score-bogey"></div>
              <span className="text-muted-foreground">Bogey</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-4 h-4 rounded score-double"></div>
              <span className="text-muted-foreground">Double+</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
