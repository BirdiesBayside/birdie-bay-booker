import { useEffect, useState } from "react";
import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import birdiesB from "@/assets/birdies-b-icon.png";

interface Tour {
  tour_id: number;
  name: string;
  active: number;
  start_date: string | null;
  end_date: string | null;
}

interface Standing {
  position: number;
  user_name: string;
  hcp: number | null;
  events: number | null;
  first: number | null;
  top5: number | null;
  top10: number | null;
  points: number | null;
}

interface Tournament {
  tournament_id: number;
  name: string;
  course_name: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
}

interface TournamentResult {
  position: number;
  playerName: string;
  hcp: number | null;
  rd1: number | null;
  rd1ToPar: number | null;
  rd2: number | null;
  rd2ToPar: number | null;
  total: number | null;
  toPar: number | null;
  courseName: string | null;
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

export default function EmbedLeaderboard() {
  const [tours, setTours] = useState<Tour[]>([]);
  const [selectedTour, setSelectedTour] = useState<number | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);
  const [tournamentResults, setTournamentResults] = useState<TournamentResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [scoreType, setScoreType] = useState<"gross" | "net">("net");
  const [viewMode, setViewMode] = useState<"overall" | "weekly">("overall");
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const INITIAL_WEEKS_TO_SHOW = 5;

  // Parse URL params for defaults
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    const tour = params.get("tour");
    const type = params.get("scoreType");
    
    if (view === "weekly") setViewMode("weekly");
    if (type === "gross") setScoreType("gross");
    if (tour) setSelectedTour(parseInt(tour));
  }, []);

  // Load tours on mount
  useEffect(() => {
    async function loadTours() {
      try {
        const data = await fetchPublicLeaderboard("tours");
        setTours(data.tours || []);
        
        // Only set default if not already set from URL
        if (!selectedTour && data.tours?.length > 0) {
          const activeTour = data.tours.find((t: Tour) => t.active === 1);
          setSelectedTour(activeTour?.tour_id || data.tours[0].tour_id);
        }
      } catch (error) {
        console.error("Failed to load tours:", error);
      }
    }
    loadTours();
  }, []);

  // Load tournaments when tour changes
  useEffect(() => {
    if (!selectedTour) return;

    async function loadTournaments() {
      try {
        const data = await fetchPublicLeaderboard("tournaments", { tourId: selectedTour.toString() });
        setTournaments(data.tournaments || []);
        if (data.tournaments?.length > 0) {
          setSelectedTournament(data.tournaments[0].tournament_id);
        }
      } catch (error) {
        console.error("Failed to load tournaments:", error);
        setTournaments([]);
      }
    }
    loadTournaments();
  }, [selectedTour]);

  // Load overall standings
  useEffect(() => {
    if (!selectedTour || viewMode !== "overall") return;

    async function loadStandings() {
      setIsLoading(true);
      try {
        const data = await fetchPublicLeaderboard("standings", {
          tourId: selectedTour.toString(),
          grossOrNet: scoreType,
        });
        setStandings(data.standings || []);
      } catch (error) {
        console.error("Failed to load standings:", error);
        setStandings([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadStandings();
  }, [selectedTour, scoreType, viewMode]);

  // Load tournament results
  useEffect(() => {
    if (!selectedTournament || viewMode !== "weekly") return;

    async function loadResults() {
      setIsLoading(true);
      try {
        const data = await fetchPublicLeaderboard("tournament-results", {
          tournamentId: selectedTournament.toString(),
          grossOrNet: scoreType,
        });
        setTournamentResults(data.results || []);
      } catch (error) {
        console.error("Failed to load results:", error);
        setTournamentResults([]);
      } finally {
        setIsLoading(false);
      }
    }
    loadResults();
  }, [selectedTournament, scoreType, viewMode]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (viewMode === "overall" && selectedTour) {
        fetchPublicLeaderboard("standings", {
          tourId: selectedTour.toString(),
          grossOrNet: scoreType,
        }).then(data => setStandings(data.standings || []));
      } else if (viewMode === "weekly" && selectedTournament) {
        fetchPublicLeaderboard("tournament-results", {
          tournamentId: selectedTournament.toString(),
          grossOrNet: scoreType,
        }).then(data => setTournamentResults(data.results || []));
      }
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, [viewMode, selectedTour, selectedTournament, scoreType]);

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2: return <Medal className="h-5 w-5 text-gray-400" />;
      case 3: return <Award className="h-5 w-5 text-amber-600" />;
      default: return null;
    }
  };

  const formatScore = (score: number | null) => {
    if (score === null || score === undefined) return "-";
    if (score === 0) return "E";
    if (score > 0) return `+${score}`;
    return score.toString();
  };

  return (
    <div className="min-h-screen bg-[hsl(37,100%,95%)] p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <img src={birdiesB} alt="Birdies" className="h-10" />
          <div>
            <h1 className="font-bold text-xl text-[hsl(128,42%,21%)]">LEADERBOARD</h1>
            <p className="text-sm text-[hsl(128,20%,40%)]">Birdies League Hub</p>
          </div>
        </div>
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as "overall" | "weekly")} className="mb-4">
        <TabsList className="grid w-full max-w-md grid-cols-2 bg-[hsl(128,42%,21%)]">
          <TabsTrigger 
            value="overall" 
            className="data-[state=active]:bg-[hsl(18,84%,55%)] data-[state=active]:text-white text-[hsl(37,100%,95%)]"
          >
            Overall Standings
          </TabsTrigger>
          <TabsTrigger 
            value="weekly"
            className="data-[state=active]:bg-[hsl(18,84%,55%)] data-[state=active]:text-white text-[hsl(37,100%,95%)]"
          >
            Weekly Results
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Select
          value={selectedTour?.toString()}
          onValueChange={(val) => setSelectedTour(parseInt(val))}
        >
          <SelectTrigger className="w-full sm:w-[250px] bg-white border-[hsl(128,20%,85%)]">
            <SelectValue placeholder="Select tour" />
          </SelectTrigger>
          <SelectContent>
            {tours.map((tour) => (
              <SelectItem key={tour.tour_id} value={tour.tour_id.toString()}>
                <div className="flex items-center gap-2">
                  <span>{tour.name}</span>
                  {tour.active === 1 && (
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-500/20 text-green-600 rounded">
                      ACTIVE
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {viewMode === "weekly" && tournaments.length > 0 && (
          <Select
            value={selectedTournament?.toString()}
            onValueChange={(val) => setSelectedTournament(parseInt(val))}
          >
            <SelectTrigger className="w-full sm:w-[300px] bg-white border-[hsl(128,20%,85%)]">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              {(showAllWeeks ? tournaments : tournaments.slice(0, INITIAL_WEEKS_TO_SHOW)).map((tournament, index) => (
                <SelectItem key={tournament.tournament_id} value={tournament.tournament_id.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{tournament.name}</span>
                    {index === 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[hsl(18,84%,55%)] text-white rounded">
                        CURRENT
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
              {tournaments.length > INITIAL_WEEKS_TO_SHOW && (
                <div
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-gray-100 text-[hsl(128,20%,40%)]"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllWeeks(!showAllWeeks);
                  }}
                >
                  {showAllWeeks ? "Show less" : `Show ${tournaments.length - INITIAL_WEEKS_TO_SHOW} more weeks...`}
                </div>
              )}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1 flex justify-center sm:justify-end">
          <div className="flex rounded-full bg-[hsl(37,40%,90%)] overflow-hidden">
            <button
              onClick={() => setScoreType("gross")}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors rounded-full",
                scoreType === "gross"
                  ? "bg-[hsl(128,42%,21%)] text-white"
                  : "text-[hsl(128,20%,40%)] hover:text-[hsl(128,42%,21%)]"
              )}
            >
              Gross
            </button>
            <button
              onClick={() => setScoreType("net")}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors rounded-full",
                scoreType === "net"
                  ? "bg-[hsl(128,42%,21%)] text-white"
                  : "text-[hsl(128,20%,40%)] hover:text-[hsl(128,42%,21%)]"
              )}
            >
              Net
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 text-[hsl(18,84%,55%)] animate-spin" />
        </div>
      ) : viewMode === "overall" ? (
        standings.length === 0 ? (
          <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] p-12 text-center">
            <h3 className="font-bold text-lg text-[hsl(128,42%,21%)] mb-2">NO STANDINGS YET</h3>
            <p className="text-[hsl(128,20%,40%)]">Standings will appear once players have completed rounds</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] overflow-hidden shadow-sm">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-[hsl(128,42%,21%)] text-sm font-medium text-white">
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
              {standings.map((standing) => (
                <div
                  key={standing.user_name}
                  className="grid grid-cols-12 gap-4 px-4 py-3 items-center hover:bg-[hsl(37,100%,97%)] transition-colors"
                >
                  <div className="col-span-2 md:col-span-1 flex items-center justify-center gap-1">
                    {getPositionIcon(standing.position)}
                    <span className={cn(
                      "font-bold",
                      standing.position <= 3 ? "text-[hsl(128,42%,21%)]" : "text-[hsl(128,20%,40%)]"
                    )}>
                      {standing.position}
                    </span>
                  </div>

                  <div className="col-span-7 md:col-span-4">
                    <p className="font-semibold text-[hsl(128,42%,21%)]">{standing.user_name}</p>
                    <p className="text-xs text-[hsl(128,20%,40%)] md:hidden">
                      {standing.events} events • {standing.points} pts
                    </p>
                  </div>

                  <div className="hidden md:block col-span-1 text-center text-[hsl(128,20%,40%)]">
                    {standing.hcp ?? "-"}
                  </div>
                  <div className="hidden md:block col-span-1 text-center text-[hsl(128,20%,40%)]">
                    {standing.events ?? 0}
                  </div>
                  <div className="hidden md:block col-span-1 text-center font-medium text-[hsl(128,42%,21%)]">
                    {standing.first || "-"}
                  </div>
                  <div className="hidden md:block col-span-1 text-center text-[hsl(128,20%,40%)]">
                    {standing.top5 || "-"}
                  </div>
                  <div className="hidden md:block col-span-1 text-center text-[hsl(128,20%,40%)]">
                    {standing.top10 || "-"}
                  </div>

                  <div className="col-span-3 md:col-span-2 text-center">
                    <span className="font-bold text-lg text-[hsl(128,42%,21%)]">{standing.points ?? 0}</span>
                    <span className="text-xs text-[hsl(128,20%,40%)] ml-1">pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        // Weekly Results View
        tournamentResults.length === 0 ? (
          <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] p-12 text-center">
            <h3 className="font-bold text-lg text-[hsl(128,42%,21%)] mb-2">NO RESULTS YET</h3>
            <p className="text-[hsl(128,20%,40%)]">
              {tournaments.length === 0 ? "No completed tournaments in this tour yet" : "No results available for this tournament"}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[hsl(128,20%,85%)] overflow-hidden shadow-sm">
            {/* Tournament Info Header */}
            {selectedTournament && tournaments.find(t => t.tournament_id === selectedTournament) && (
              <div className="px-4 py-3 bg-[hsl(128,42%,21%)]/10 border-b border-[hsl(128,20%,85%)]">
                <h3 className="font-bold text-[hsl(128,42%,21%)]">
                  {tournaments.find(t => t.tournament_id === selectedTournament)?.name}
                </h3>
                <p className="text-sm text-[hsl(128,20%,40%)]">
                  {tournaments.find(t => t.tournament_id === selectedTournament)?.course_name}
                </p>
              </div>
            )}

            {/* Table Header */}
            <div className="hidden md:grid grid-cols-12 gap-2 px-4 py-3 bg-[hsl(128,42%,21%)] text-sm font-medium text-white">
              <div className="col-span-1 text-center">#</div>
              <div className="col-span-3">Player</div>
              <div className="col-span-1 text-center">HCP</div>
              <div className="col-span-2 text-center">Rd 1</div>
              <div className="col-span-2 text-center">Rd 2</div>
              <div className="col-span-1 text-center">Total</div>
              <div className="col-span-2 text-center">To Par</div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[hsl(128,20%,85%)]">
              {tournamentResults.map((result) => (
                <div
                  key={result.playerName}
                  className="grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-[hsl(37,100%,97%)] transition-colors"
                >
                  <div className="col-span-2 md:col-span-1 flex items-center justify-center gap-1">
                    {getPositionIcon(result.position)}
                    <span className={cn(
                      "font-bold",
                      result.position <= 3 ? "text-[hsl(128,42%,21%)]" : "text-[hsl(128,20%,40%)]"
                    )}>
                      {result.position}
                    </span>
                  </div>

                  <div className="col-span-6 md:col-span-3">
                    <p className="font-semibold text-[hsl(128,42%,21%)]">{result.playerName}</p>
                    <p className="text-xs text-[hsl(128,20%,40%)] md:hidden">
                      HCP: {result.hcp ?? "-"} | Rd1:{" "}
                      {result.dnf && result.rd1 === null ? "DNF" : result.rd1 ?? "-"} | Rd2:{" "}
                      {result.dnf && result.rd2 === null ? "DNF" : result.rd2 ?? "-"} | Total:{" "}
                      {result.dnf ? "DNF" : result.total ?? "-"} ({result.dnf ? "DNF" : formatScore(result.toPar)})
                    </p>
                  </div>

                  <div className="hidden md:block col-span-1 text-center text-[hsl(128,20%,40%)]">
                    {result.hcp ?? "-"}
                  </div>
                  <div className="hidden md:block col-span-2 text-center text-[hsl(128,20%,40%)]">
                    {result.dnf && result.rd1 === null ? "DNF" : result.rd1 ?? "-"}
                  </div>
                  <div className="hidden md:block col-span-2 text-center text-[hsl(128,20%,40%)]">
                    {result.dnf && result.rd2 === null ? "DNF" : result.rd2 ?? "-"}
                  </div>
                  <div className="hidden md:block col-span-1 text-center font-bold text-[hsl(128,42%,21%)]">
                    {result.dnf ? "DNF" : result.total ?? "-"}
                  </div>
                  <div className="col-span-4 md:col-span-2 text-center">
                    <span
                      className={cn(
                        "px-2 py-1 rounded font-bold text-sm",
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
        )
      )}

      {/* Footer */}
      <div className="mt-6 text-center text-xs text-[hsl(128,20%,40%)]">
        Powered by Birdies League Hub • Auto-updates every 5 minutes
      </div>
    </div>
  );
}
