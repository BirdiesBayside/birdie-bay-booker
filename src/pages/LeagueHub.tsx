import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { LeagueRegistrationPrompt } from "@/components/league/LeagueRegistrationPrompt";
import { StatCard } from "@/components/league/StatCard";
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
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScorecardDisplay } from "@/components/league/ScorecardDisplay";

export default function LeagueHub() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>("");
  const [sgtUserId, setSgtUserId] = useState<number | null>(null);
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
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, email, sgt_user_id")
          .eq("user_id", user.id)
          .maybeSingle();

        setDisplayName(profile?.display_name || profile?.first_name || user.email?.split("@")[0] || "Golfer");
        setSgtUserId(profile?.sgt_user_id || null);

        // Only fetch SGT data if user has linked account
        if (profile?.sgt_user_id) {
          const [statsData, roundsData] = await Promise.all([
            sgtClient.getMemberStats().catch(() => null),
            sgtClient.getPlayerRounds().catch(() => []),
          ]);

          setStats(statsData);
          setRecentRounds(roundsData.slice(0, 5));
        }
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
        <Loader2 className="h-8 w-8 text-birdies-orange animate-spin" />
      </div>
    );
  }

  return (
    <LeagueLayout>
      {/* Welcome Section */}
      <div className="mb-6 animate-fade-in">
        <h1 className="font-anton text-2xl md:text-3xl text-primary mb-1">
          WELCOME BACK, {displayName.toUpperCase()}
        </h1>
        <p className="font-inter text-muted-foreground text-sm">
          Here's your latest performance in the League Hub
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 text-birdies-orange animate-spin" />
        </div>
      ) : !sgtUserId ? (
        // Show registration prompt if user doesn't have SGT account
        <LeagueRegistrationPrompt />
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
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
              <h2 className="font-anton text-xl text-primary">RECENT ROUNDS</h2>
              <Link
                to="/league/rounds"
                className="flex items-center gap-1 text-birdies-orange font-inter font-medium text-sm hover:underline"
              >
                View all <ChevronRight className="h-4 w-4" />
              </Link>
            </div>

            {recentRounds.length === 0 ? (
              <div className="bg-white rounded-2xl border border-border/50 p-8 text-center shadow-sm">
                <p className="text-muted-foreground font-inter">
                  No rounds recorded yet. Get out there and play!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentRounds.slice(0, 3).map((round, index) => {
                  const roundKey = `${round.tournamentId}-${round.scorecard?.round || index}`;
                  const isExpanded = expandedRound === roundKey;
                  return (
                    <div
                      key={roundKey}
                      className="bg-white rounded-2xl border border-border/50 overflow-hidden shadow-sm"
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
          </div>
        </>
      )}
    </LeagueLayout>
  );
}