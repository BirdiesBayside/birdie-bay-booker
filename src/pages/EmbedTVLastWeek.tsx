import { useEffect, useState } from "react";
import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import birdiesLogo from "@/assets/birdies-b-orange.png";

interface Tour {
  tour_id: number;
  name: string;
  active: number;
}

interface Tournament {
  tournament_id: number;
  name: string;
  course_name: string | null;
  start_date: string | null;
  status: string | null;
}

interface TournamentResult {
  position: number;
  playerName: string;
  hcp: number | null;
  rd1: number | null;
  rd2: number | null;
  total: number | null;
  toPar: number | null;
  dnf: boolean;
}

async function fetchPublicLeaderboard(action: string, params: Record<string, string> = {}) {
  const { data, error } = await supabase.functions.invoke("public-leaderboard", {
    method: "POST",
    body: { action, ...params },
  });
  if (error) throw error;
  return data;
}

export default function EmbedTVLastWeek() {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [previousTournament, setPreviousTournament] = useState<Tournament | null>(null);
  const [results, setResults] = useState<TournamentResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = async () => {
    try {
      // Get tours and find active one
      const toursData = await fetchPublicLeaderboard("tours");
      const active = toursData.tours?.find((t: Tour) => t.active === 1) || toursData.tours?.[0];
      if (!active) return;
      setActiveTour(active);

      // Get tournaments for active tour - get the second one (previous week)
      const tournamentsData = await fetchPublicLeaderboard("tournaments", { tourId: active.tour_id.toString() });
      const previous = tournamentsData.tournaments?.[1]; // Index 1 = previous week
      if (!previous) return;
      setPreviousTournament(previous);

      // Get results for previous tournament
      const resultsData = await fetchPublicLeaderboard("tournament-results", {
        tournamentId: previous.tournament_id.toString(),
        grossOrNet: "net",
      });
      setResults(resultsData.results || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load TV data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 60 seconds for live updates
    const interval = setInterval(loadData, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-8 w-8 text-yellow-500" />;
      case 2: return <Medal className="h-8 w-8 text-gray-400" />;
      case 3: return <Award className="h-8 w-8 text-amber-600" />;
      default: return null;
    }
  };

  const formatScore = (score: number | null) => {
    if (score === null || score === undefined) return "-";
    if (score === 0) return "E";
    if (score > 0) return `+${score}`;
    return score.toString();
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
              {previousTournament?.name || "Last Week Results"}
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              {previousTournament?.course_name} • NET Scores
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="px-6 py-3 bg-[hsl(128,42%,21%)] text-white rounded-lg text-xl font-bold">
            LAST WEEK
          </div>
          <p className="text-sm text-[hsl(128,20%,40%)] mt-2">
            Updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className="flex-1 bg-white rounded-2xl border-2 border-[hsl(128,20%,85%)] overflow-hidden shadow-lg">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-4 bg-[hsl(128,42%,21%)] text-xl font-bold text-white">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Player</div>
          <div className="col-span-1 text-center">HCP</div>
          <div className="col-span-2 text-center">Rd 1</div>
          <div className="col-span-2 text-center">Rd 2</div>
          <div className="col-span-1 text-center">Total</div>
          <div className="col-span-1 text-center">+/-</div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-[hsl(128,20%,85%)]">
          {results.slice(0, 12).map((result) => (
            <div
              key={result.playerName}
              className={cn(
                "grid grid-cols-12 gap-4 px-6 py-4 items-center",
                result.position <= 3 && "bg-[hsl(37,100%,97%)]"
              )}
            >
              <div className="col-span-1 flex items-center justify-center gap-2">
                {getPositionIcon(result.position)}
                <span className={cn(
                  "font-bold text-2xl",
                  result.position <= 3 ? "text-[hsl(128,42%,21%)]" : "text-[hsl(128,20%,40%)]"
                )}>
                  {result.position}
                </span>
              </div>

              <div className="col-span-4">
                <p className="font-bold text-2xl text-[hsl(128,42%,21%)]">{result.playerName}</p>
              </div>

              <div className="col-span-1 text-center text-xl text-[hsl(128,20%,40%)]">
                {result.hcp ?? "-"}
              </div>
              <div className="col-span-2 text-center text-xl text-[hsl(128,20%,40%)]">
                {result.dnf && result.rd1 === null ? "DNF" : result.rd1 ?? "-"}
              </div>
              <div className="col-span-2 text-center text-xl text-[hsl(128,20%,40%)]">
                {result.dnf && result.rd2 === null ? "DNF" : result.rd2 ?? "-"}
              </div>
              <div className="col-span-1 text-center font-bold text-2xl text-[hsl(128,42%,21%)]">
                {result.dnf ? "DNF" : result.total ?? "-"}
              </div>
              <div className="col-span-1 text-center">
                <span
                  className={cn(
                    "px-3 py-1 rounded-lg font-bold text-xl",
                    result.dnf && "bg-muted text-muted-foreground",
                    !result.dnf && result.toPar !== null && result.toPar < 0 && "bg-red-100 text-red-700",
                    !result.dnf && result.toPar === 0 && "bg-green-100 text-green-700",
                    !result.dnf && result.toPar !== null && result.toPar > 0 && "bg-blue-100 text-blue-700",
                  )}
                >
                  {result.dnf ? "DNF" : formatScore(result.toPar)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-lg text-[hsl(128,20%,40%)]">
        Live updates every 60 seconds • Powered by Birdies League Hub
      </div>
    </div>
  );
}
