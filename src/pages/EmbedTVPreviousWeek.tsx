import { useEffect, useState } from "react";
import { Trophy, Medal, Award, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import birdiesLogo from "@/assets/birdies-b-orange.png";

interface TournamentStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  r1: string;
  r1Thru: string;
  r2: string;
  r2Thru: string;
  total: string;
  toPar: string;
}

interface Tournament {
  tournament_id: number;
  name: string;
  course_name: string | null;
}

export default function EmbedTVLastWeek() {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [standings, setStandings] = useState<TournamentStanding[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadData = async () => {
    try {
      // Get the Loco Wrapz Championship tour (tour_id 2458) which has the weekly tournaments
      const { data: activeTour } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("tour_id", 2458)
        .maybeSingle();

      if (!activeTour) {
        setIsLoading(false);
        return;
      }

      // Get the current tournament (most recent that has started)
      const today = new Date().toISOString().split("T")[0];
      const { data: tournaments } = await supabase
        .from("sgt_tournaments")
        .select("tournament_id, name, course_name, start_date")
        .eq("tour_id", activeTour.tour_id)
        .lte("start_date", today)
        .order("start_date", { ascending: false })
        .limit(1);

      if (!tournaments || tournaments.length === 0) {
        setIsLoading(false);
        return;
      }

      const currentTournament = tournaments[0];
      setTournament(currentTournament);

      // Use the embed scrape to get live standings
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke(
        "sgt-embed-scrape",
        {
          body: {
            type: "tournament",
            id: currentTournament.tournament_id.toString(),
            scoreType: "net",
          },
        }
      );

      if (scrapeError) {
        console.error("Scrape error:", scrapeError);
      } else if (scrapeData?.standings) {
        setStandings(scrapeData.standings);
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load TV data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30 * 1000);
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

  const getScoreColor = (toPar: string) => {
    if (toPar === "-" || toPar === "") return "";
    if (toPar === "E") return "bg-green-100 text-green-700";
    if (toPar.startsWith("-")) return "bg-red-100 text-red-700";
    return "bg-blue-100 text-blue-700";
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
              {tournament?.name || "This Week"}
            </h1>
            <p className="text-xl text-[hsl(128,20%,40%)]">
              {tournament?.course_name} • NET Scores
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="px-6 py-3 bg-[hsl(18,84%,55%)] text-white rounded-lg text-xl font-bold">
            PREVIOUS WEEK
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
          {standings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-2xl text-[hsl(128,20%,40%)]">
                No results available yet
              </p>
              <p className="text-lg text-[hsl(128,20%,60%)] mt-2">
                Play a round to appear on the leaderboard!
              </p>
            </div>
          ) : (
            standings.slice(0, 12).map((result) => (
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
                  {result.r1}
                  {result.r1Thru && result.r1Thru !== "F" && (
                    <span className="text-sm ml-1">({result.r1Thru})</span>
                  )}
                </div>
                <div className="col-span-2 text-center text-xl text-[hsl(128,20%,40%)]">
                  {result.r2}
                  {result.r2Thru && result.r2Thru !== "F" && (
                    <span className="text-sm ml-1">({result.r2Thru})</span>
                  )}
                </div>
                <div className="col-span-1 text-center font-bold text-2xl text-[hsl(128,42%,21%)]">
                  {result.total}
                </div>
                <div className="col-span-1 text-center">
                  <span className={cn(
                    "px-3 py-1 rounded-lg font-bold text-xl",
                    getScoreColor(result.toPar)
                  )}>
                    {result.toPar}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-4 text-center text-lg text-[hsl(128,20%,40%)]">
        Live Results • Updates every 30 seconds • Powered by Birdies League Hub
      </div>
    </div>
  );
}
