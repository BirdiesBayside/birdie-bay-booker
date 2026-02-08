import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { useSGTTournamentStandings } from "@/hooks/useSGTEmbedData";
import { useActiveTourData } from "@/hooks/useActiveTourData";
import { Loader2, Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export default function LeagueLeaderboard() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>("");
  const [scoreType, setScoreType] = useState<"gross" | "net">("net");
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const INITIAL_WEEKS_TO_SHOW = 5;

  // Get active tour and tournaments automatically
  const { activeTour, tournaments, isLoading: tourLoading } = useActiveTourData();
  
  const [selectedTournament, setSelectedTournament] = useState<number | null>(null);

  // Set initial tournament when data loads
  useEffect(() => {
    if (tournaments.length > 0 && !selectedTournament) {
      setSelectedTournament(tournaments[0].tournament_id);
    }
  }, [tournaments, selectedTournament]);

  const { 
    standings: tournamentStandings, 
    isLoading: tournamentStandingsLoading,
  } = useSGTTournamentStandings({
    id: selectedTournament,
    scoreType,
    enabled: !!selectedTournament,
    refreshInterval: 30000,
  });

  const isLoading = tourLoading || tournamentStandingsLoading;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadDisplayName() {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      
      setDisplayName(profile?.display_name || "");
    }
    loadDisplayName();
  }, [authLoading, user]);

  if (authLoading || !user || tourLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-secondary animate-spin" />
      </div>
    );
  }

  const getPositionIcon = (position: number) => {
    switch (position) {
      case 1: return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2: return <Medal className="h-5 w-5 text-gray-400" />;
      case 3: return <Award className="h-5 w-5 text-amber-600" />;
      default: return null;
    }
  };

  const getScoreColor = (score: string) => {
    if (score === "-" || score === "") return "";
    if (score === "E") return "text-foreground";
    if (score.startsWith("-")) return "text-green-500";
    return "text-red-500";
  };

  // Filter tournaments for the active tour only
  const filteredTournaments = activeTour 
    ? tournaments.filter(t => t.tour_id === activeTour.tour_id)
    : tournaments;

  return (
    <LeagueLayout>
      <div className="mb-8 animate-fade-in">
        <h1 className="font-anton text-3xl md:text-4xl text-foreground mb-2">
          WEEKLY RESULTS
        </h1>
        <p className="font-inter text-muted-foreground">
          {activeTour?.name || "Birdies Tour"} • See how you compare each week
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6 animate-slide-up">
        {filteredTournaments.length > 0 && (
          <Select
            value={selectedTournament?.toString()}
            onValueChange={(val) => setSelectedTournament(parseInt(val))}
          >
            <SelectTrigger className="w-full sm:w-[350px] font-inter">
              <SelectValue placeholder="Select week" />
            </SelectTrigger>
            <SelectContent>
              {(showAllWeeks ? filteredTournaments : filteredTournaments.slice(0, INITIAL_WEEKS_TO_SHOW)).map((tournament, index) => (
                <SelectItem key={tournament.tournament_id} value={tournament.tournament_id.toString()}>
                  <div className="flex items-center gap-2">
                    <span>{tournament.name}</span>
                    {index === 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-secondary text-secondary-foreground rounded">
                        CURRENT
                      </span>
                    )}
                  </div>
                </SelectItem>
              ))}
              {filteredTournaments.length > INITIAL_WEEKS_TO_SHOW && (
                <div
                  className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground font-inter text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllWeeks(!showAllWeeks);
                  }}
                >
                  {showAllWeeks ? "Show less" : `Show ${filteredTournaments.length - INITIAL_WEEKS_TO_SHOW} more weeks...`}
                </div>
              )}
            </SelectContent>
          </Select>
        )}

        <div className="flex-1 flex justify-center sm:justify-end">
          <div className="flex rounded-full bg-muted overflow-hidden">
            <button
              onClick={() => setScoreType("gross")}
              className={cn(
                "px-4 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                scoreType === "gross"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Gross
            </button>
            <button
              onClick={() => setScoreType("net")}
              className={cn(
                "px-4 py-2 font-inter text-sm font-medium transition-colors rounded-full",
                scoreType === "net"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Net
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-secondary animate-spin" />
        </div>
      ) : tournamentStandings.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center animate-fade-in">
          <h3 className="font-anton text-xl text-foreground mb-2">NO RESULTS YET</h3>
          <p className="text-muted-foreground font-inter">
            {filteredTournaments.length === 0
              ? "No tournaments available yet"
              : "No results available for this tournament"
            }
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden animate-slide-up">
          {/* Tournament Info Header */}
          {selectedTournament && filteredTournaments.find(t => t.tournament_id === selectedTournament) && (
            <div className="px-4 py-3 bg-primary/10 border-b border-border">
              <h3 className="font-anton text-lg text-foreground">
                {filteredTournaments.find(t => t.tournament_id === selectedTournament)?.name}
              </h3>
              <p className="font-inter text-sm text-muted-foreground">
                {filteredTournaments.find(t => t.tournament_id === selectedTournament)?.course_name}
              </p>
            </div>
          )}

          {/* Table Header - Mobile */}
          <div className="grid md:hidden grid-cols-12 gap-4 px-4 py-2 bg-muted/50 border-b border-border font-inter text-xs font-medium text-muted-foreground">
            <div className="col-span-2 text-center">#</div>
            <div className="col-span-4">Player</div>
            <div className="col-span-2 text-center">R1</div>
            <div className="col-span-2 text-center">R2</div>
            <div className="col-span-2 text-center">+/-</div>
          </div>

          {/* Table Header - Desktop */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 bg-muted/50 border-b border-border font-inter text-sm font-medium text-muted-foreground">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4">Player</div>
            <div className="col-span-2 text-center">R1</div>
            <div className="col-span-2 text-center">R2</div>
            <div className="col-span-1 text-center">Total</div>
            <div className="col-span-2 text-center">To Par</div>
          </div>

          <div className="divide-y divide-border">
            {tournamentStandings.map((result, index) => {
              const isCurrentPlayer = displayName && result.playerName.toLowerCase() === displayName.toLowerCase();

              return (
                <div
                  key={result.playerName}
                  className={cn(
                    "grid grid-cols-12 gap-4 px-4 py-4 items-center transition-colors",
                    isCurrentPlayer && "bg-secondary/10 border-l-4 border-secondary",
                    !isCurrentPlayer && "hover:bg-muted/30"
                  )}
                  style={{ animationDelay: `${index * 30}ms` }}
                >
                  {/* Mobile Layout */}
                  <div className="col-span-2 md:hidden flex items-center justify-center gap-1">
                    {getPositionIcon(result.position)}
                    <span className={cn(
                      "font-display text-lg",
                      result.position <= 3 ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {result.position}
                    </span>
                  </div>

                  <div className="col-span-4 md:hidden flex items-center gap-2">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-display text-sm",
                      isCurrentPlayer
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary text-primary-foreground"
                    )}>
                      {result.playerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="truncate">
                      <p className={cn(
                        "font-inter text-sm font-semibold truncate",
                        isCurrentPlayer ? "text-secondary" : "text-foreground"
                      )}>
                        {result.playerName}
                        {isCurrentPlayer && <span className="text-xs ml-1">(You)</span>}
                      </p>
                      <p className="font-inter text-xs text-muted-foreground">
                        HCP: {result.hcp ?? "-"}
                      </p>
                    </div>
                  </div>

                  <div className="col-span-2 md:hidden text-center">
                    <span className={cn("font-inter text-sm", getScoreColor(result.r1))}>
                      {result.r1}
                    </span>
                  </div>

                  <div className="col-span-2 md:hidden text-center">
                    <span className={cn("font-inter text-sm", getScoreColor(result.r2))}>
                      {result.r2}
                    </span>
                  </div>

                  <div className="col-span-2 md:hidden text-center">
                    <span className={cn(
                      "px-2 py-1 rounded font-medium text-sm",
                      result.toPar.startsWith("-") && "bg-green-100 text-green-700",
                      result.toPar === "E" && "bg-muted text-foreground",
                      result.toPar.startsWith("+") && "bg-red-100 text-red-700",
                    )}>
                      {result.toPar}
                    </span>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden md:flex col-span-1 items-center justify-center gap-2">
                    {getPositionIcon(result.position)}
                    <span className={cn(
                      "font-display text-lg",
                      result.position <= 3 ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {result.position}
                    </span>
                  </div>

                  <div className="hidden md:flex col-span-4 items-center gap-3">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center font-display text-lg",
                      isCurrentPlayer
                        ? "bg-secondary text-secondary-foreground"
                        : "bg-primary text-primary-foreground"
                    )}>
                      {result.playerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className={cn(
                        "font-inter font-semibold",
                        isCurrentPlayer ? "text-secondary" : "text-foreground"
                      )}>
                        {result.playerName}
                        <span className="text-muted-foreground font-normal ml-1">
                          ({result.hcp ?? "-"})
                        </span>
                        {isCurrentPlayer && <span className="text-xs ml-2">(You)</span>}
                      </p>
                    </div>
                  </div>

                  <div className="hidden md:block col-span-2 text-center">
                    <span className={cn("font-inter", getScoreColor(result.r1))}>
                      {result.r1}
                    </span>
                    {result.r1Thru && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {result.r1Thru === "F" ? "F" : `(${result.r1Thru})`}
                      </span>
                    )}
                  </div>

                  <div className="hidden md:block col-span-2 text-center">
                    <span className={cn("font-inter", getScoreColor(result.r2))}>
                      {result.r2}
                    </span>
                    {result.r2Thru && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {result.r2Thru === "F" ? "F" : `(${result.r2Thru})`}
                      </span>
                    )}
                  </div>

                  <div className="hidden md:block col-span-1 text-center font-display text-lg">
                    {result.total}
                  </div>

                  <div className="hidden md:block col-span-2 text-center">
                    <span className={cn(
                      "px-3 py-1 rounded-lg font-display text-lg",
                      result.toPar.startsWith("-") && "bg-green-100 text-green-700",
                      result.toPar === "E" && "bg-muted text-foreground",
                      result.toPar.startsWith("+") && "bg-red-100 text-red-700",
                    )}>
                      {result.toPar}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </LeagueLayout>
  );
}
