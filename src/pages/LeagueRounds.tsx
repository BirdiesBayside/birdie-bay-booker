import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams, useNavigate } from "react-router-dom";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { ScorecardDisplay } from "@/components/league/ScorecardDisplay";
import { sgtClient, PlayerRound } from "@/lib/sgt-api";
import { Loader2, MapPin, ChevronDown } from "lucide-react";

export default function LeagueRounds() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rounds, setRounds] = useState<PlayerRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState<string | null>(
    searchParams.get("round")
  );

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadRounds() {
      setIsLoading(true);
      try {
        const data = await sgtClient.getPlayerRounds();
        setRounds(data);
      } catch (error) {
        console.error("Failed to load rounds:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadRounds();
  }, [user, authLoading]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-birdies-orange animate-spin" />
      </div>
    );
  }

  const toggleExpand = (roundKey: string) => {
    setExpandedRound(expandedRound === roundKey ? null : roundKey);
  };

  return (
    <LeagueLayout>
      <div className="mb-6 animate-fade-in">
        <h1 className="font-anton text-2xl md:text-3xl text-primary mb-1">
          ROUND HISTORY
        </h1>
        <p className="font-inter text-muted-foreground text-sm">
          {rounds.length} rounds recorded at Birdies
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-birdies-orange animate-spin" />
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border/50 p-12 text-center shadow-sm animate-fade-in">
          <h3 className="font-anton text-xl text-primary mb-2">NO ROUNDS YET</h3>
          <p className="text-muted-foreground font-inter">
            Your round history will appear here once you've played some rounds.
          </p>
        </div>
      ) : (
        <div className="space-y-3 animate-slide-up">
          {rounds.map((round, index) => {
            const roundKey = `${round.tournamentId}-${round.scorecard?.round || index}`;
            const isExpanded = expandedRound === roundKey;
            return (
              <div
                key={roundKey}
                className="bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => toggleExpand(roundKey)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="font-inter font-semibold text-primary text-base leading-tight mb-2">
                        {round.tournamentName}
                        {round.scorecard?.round && ` - Round ${round.scorecard.round}`}
                      </h3>
                      <span className={`inline-block px-3 py-1 rounded-full text-xs font-inter font-medium mb-2 ${
                        round.status === "Completed"
                          ? "badge-completed"
                          : "badge-in-progress"
                      }`}>
                        {round.status}
                      </span>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground font-inter">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span>{round.courseName}</span>
                        <span className="text-border">•</span>
                        <span>
                          {new Date(round.date).toLocaleDateString("en-AU", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}
                        </span>
                      </div>
                    </div>
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-border/50 animate-fade-in">
                    <ScorecardDisplay scorecard={round.scorecard} showDetails />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </LeagueLayout>
  );
}