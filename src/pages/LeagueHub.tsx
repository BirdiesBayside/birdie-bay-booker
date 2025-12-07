import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { StatCard } from "@/components/league/StatCard";
import { ScorecardDisplay } from "@/components/league/ScorecardDisplay";
import { sgtClient, MemberStats, PlayerRound } from "@/lib/sgt-api";
import {
  Target,
  TrendingUp,
  Trophy,
  Calendar,
  Loader2,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

export default function LeagueHub() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>("");
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [recentRounds, setRecentRounds] = useState<PlayerRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRound, setExpandedRound] = useState<string | null>(null);

  const toggleExpand = (roundKey: string) => {
    setExpandedRound(expandedRound === roundKey ? null : roundKey);
  };

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadDashboard() {
      setIsLoading(true);
      try {
        // Get display name from profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        setDisplayName(profile?.display_name || profile?.first_name || user.email?.split("@")[0] || "Golfer");

        const [statsData, roundsData] = await Promise.all([
          sgtClient.getMemberStats().catch(() => null),
          sgtClient.getPlayerRounds().catch(() => []),
        ]);

        setStats(statsData);
        setRecentRounds(roundsData.slice(0, 5));
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboard();
  }, [user, authLoading]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-secondary animate-spin" />
      </div>
    );
  }

  return (
    <LeagueLayout>
      {/* Welcome Section */}
      <div className="mb-8 animate-fade-in">
        <h1 className="font-anton text-3xl md:text-4xl text-foreground mb-2">
          WELCOME BACK, {displayName.toUpperCase()}
        </h1>
        <p className="font-inter text-muted-foreground">
          Here's your latest performance at Birdies
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-secondary animate-spin" />
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              label="Handicap"
              value={stats?.handicap ?? "N/A"}
              icon={<Target className="h-5 w-5" />}
              delay={0}
            />
            <StatCard
              label="Rounds Played"
              value={recentRounds.length}
              subValue="This season"
              icon={<Calendar className="h-5 w-5" />}
              delay={100}
            />
            <StatCard
              label="Tour Position"
              value={stats?.standing?.position ? `#${stats.standing.position}` : "N/A"}
              subValue={stats?.standing ? `${stats.standing.points} pts` : undefined}
              icon={<Trophy className="h-5 w-5" />}
              delay={200}
            />
            <StatCard
              label="Best Finish"
              value={stats?.standing?.first ? `${stats.standing.first} Win${stats.standing.first > 1 ? "s" : ""}` : stats?.standing?.top5 ? `${stats.standing.top5} Top 5` : "N/A"}
              icon={<TrendingUp className="h-5 w-5" />}
              delay={300}
            />
          </div>

          {/* Recent Rounds */}
          <div className="mb-8 animate-slide-up" style={{ animationDelay: "200ms" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-anton text-2xl text-foreground">RECENT ROUNDS</h2>
              <Link
                to="/league/rounds"
                className="flex items-center gap-1 text-secondary font-inter font-medium text-sm hover:underline"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {recentRounds.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <p className="text-muted-foreground font-inter">
                  No rounds recorded yet. Get out there and play!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentRounds.slice(0, 3).map((round, index) => {
                  const roundKey = `${round.tournamentId}-${round.scorecard?.round || index}`;
                  const isExpanded = expandedRound === roundKey;
                  return (
                    <div
                      key={roundKey}
                      className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow"
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
          </div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-2 gap-4 animate-slide-up" style={{ animationDelay: "300ms" }}>
            <Link
              to="/league/leaderboard"
              className="bg-primary text-primary-foreground rounded-xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5 group"
            >
              <Trophy className="h-8 w-8 mb-3 group-hover:animate-float" />
              <h3 className="font-anton text-xl mb-1">VIEW LEADERBOARD</h3>
              <p className="font-inter text-primary-foreground/80 text-sm">
                See how you stack up against other players
              </p>
            </Link>
            <Link
              to="/league/rounds"
              className="bg-secondary text-secondary-foreground rounded-xl p-6 hover:shadow-lg transition-all hover:-translate-y-0.5 group"
            >
              <Calendar className="h-8 w-8 mb-3 group-hover:animate-float" />
              <h3 className="font-anton text-xl mb-1">ROUND HISTORY</h3>
              <p className="font-inter text-secondary-foreground/80 text-sm">
                View detailed scorecards from all your rounds
              </p>
            </Link>
          </div>
        </>
      )}
    </LeagueLayout>
  );
}
