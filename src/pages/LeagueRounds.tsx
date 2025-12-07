import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSearchParams, useNavigate } from "react-router-dom";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { ScorecardDisplay } from "@/components/league/ScorecardDisplay";
import { sgtClient, PlayerRound } from "@/lib/sgt-api";
import { Loader2, MapPin, ChevronDown, ChevronUp } from "lucide-react";

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
        <Loader2 className="h-8 w-8 text-secondary animate-spin" />
      </div>
    );
  }

  const toggleExpand = (roundKey: string) => {
    setExpandedRound(expandedRound === roundKey ? null : roundKey);
  };

  return (
    <LeagueLayout>
      <div className="mb-8 animate-fade-in">
        <h1 className="font-anton text-3xl md:text-4xl text-foreground mb-2">
          ROUND HISTORY
        </h1>
        <p className="font-inter text-muted-foreground">
          View all your rounds and detailed scorecards
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-secondary animate-spin" />
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-12 text-center animate-fade-in">
          <h3 className="font-anton text-xl text-foreground mb-2">NO ROUNDS YET</h3>
          <p className="text-muted-foreground font-inter">
            Your round history will appear here once you've played some rounds.
          </p>
        </div>
      ) : (
        <div className="space-y-4 animate-slide-up">
          {rounds.map((round, index) => {
            const roundKey = `${round.tournamentId}-${round.scorecard?.round || index}`;
            const isExpanded = expandedRound === roundKey;
            return (
              <div
                key={roundKey}
                className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <button
                  onClick={() => toggleExpand(roundKey)}
                  className="w-full p-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-inter font-semibold text-foreground">
                        {round.tournamentName}
                        {round.scorecard?.round && ` - Round ${round.scorecard.round}`}
                      </h3>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground font-inter">
                        <MapPin className="h-3 w-3" />
                        {round.courseName}
                        <span className="text-border">•</span>
                        {new Date(round.date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric"
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-inter font-medium ${
                        round.status === "Completed"
                          ? "bg-birdie/20 text-birdie"
                          : "bg-secondary/20 text-secondary"
                      }`}>
                        {round.status}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <ScorecardDisplay scorecard={round.scorecard} />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-border animate-fade-in">
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
