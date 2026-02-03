import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSGTTourStandings } from "@/hooks/useSGTEmbedData";
import birdiesLogo from "@/assets/birdies-b-orange.png";

// Tour ID for the current active tour
const ACTIVE_TOUR_ID = 2458;

export default function EmbedTVStandings() {
  const { standings, isLoading, lastUpdated } = useSGTTourStandings({
    id: ACTIVE_TOUR_ID,
    scoreType: "net",
    refreshInterval: 30000, // 30 second refresh for live updates
  });

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-8 w-8 text-yellow-500" />;
      case 2: return <Medal className="h-8 w-8 text-gray-400" />;
      case 3: return <Award className="h-8 w-8 text-amber-600" />;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(37,100%,95%)] flex items-center justify-center">
        <Loader2 className="h-16 w-16 text-[hsl(18,84%,55%)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(37,100%,95%)] p-8 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-6">
          <img src={birdiesLogo} alt="Birdies" className="h-16" />
          <div>
            <h1 className="font-bold text-4xl text-[hsl(128,42%,21%)] tracking-tight">
              OVERALL STANDINGS
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              Birdies League Hub • NET Scores
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="px-6 py-3 bg-[hsl(128,42%,21%)] text-white rounded-lg text-xl font-bold">
            OVERALL
          </div>
          {lastUpdated && (
            <p className="text-sm text-[hsl(128,20%,40%)] mt-2">
              Updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>

      {/* Standings Table */}
      <div className="flex-1 bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] overflow-hidden shadow-lg">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-[hsl(128,42%,21%)] text-xl font-bold text-white">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-1 text-center">HCP</div>
          <div className="col-span-1 text-center">Events</div>
          <div className="col-span-1 text-center">Wins</div>
          <div className="col-span-1 text-center">Top 5</div>
          <div className="col-span-1 text-center">Top 10</div>
          <div className="col-span-2 text-center">Points</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-[hsl(128,20%,85%)]">
          {standings.slice(0, 12).map((standing) => (
            <div
              key={standing.playerName}
              className={cn(
                "grid grid-cols-12 gap-4 px-6 py-4 items-center",
                standing.position <= 3 && "bg-[hsl(37,100%,97%)]"
              )}
            >
              <div className="col-span-1 flex items-center justify-center gap-2">
                {getPositionIcon(standing.position)}
                <span className={cn(
                  "font-bold text-2xl",
                  standing.position <= 3 ? "text-[hsl(128,42%,21%)]" : "text-[hsl(128,20%,40%)]"
                )}>
                  {standing.position}
                </span>
              </div>

              <div className="col-span-4">
                <p className="font-bold text-2xl text-[hsl(128,42%,21%)]">{standing.playerName}</p>
              </div>

              <div className="col-span-1 text-center text-xl text-[hsl(128,20%,40%)]">
                {standing.hcp ?? "-"}
              </div>
              <div className="col-span-1 text-center text-xl text-[hsl(128,20%,40%)]">
                {standing.events ?? 0}
              </div>
              <div className="col-span-1 text-center text-xl font-medium text-[hsl(128,42%,21%)]">
                {standing.wins || "-"}
              </div>
              <div className="col-span-1 text-center text-xl text-[hsl(128,20%,40%)]">
                {standing.top5 || "-"}
              </div>
              <div className="col-span-1 text-center text-xl text-[hsl(128,20%,40%)]">
                {standing.top10 || "-"}
              </div>
              <div className="col-span-2 text-center">
                <span className="font-bold text-3xl text-[hsl(128,42%,21%)]">
                  {standing.points ?? 0}
                </span>
                <span className="text-lg text-[hsl(128,20%,40%)] ml-1">pts</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-lg text-[hsl(128,20%,40%)]">
        Live updates every 30 seconds • Powered by Birdies League Hub
      </div>
    </div>
  );
}
