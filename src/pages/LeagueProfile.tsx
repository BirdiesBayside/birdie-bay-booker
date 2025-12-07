import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { LeagueLayout } from "@/components/league/LeagueLayout";
import { StatCard } from "@/components/league/StatCard";
import { ProgressStatCard } from "@/components/league/ProgressStatCard";
import { sgtClient, MemberStats, PlayerRound } from "@/lib/sgt-api";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Mail,
  Target,
  Trophy,
  TrendingDown,
  BarChart3,
  Zap,
  CircleDot,
  AlertTriangle,
  Gauge,
  Award
} from "lucide-react";

interface HoleData {
  [key: string]: number | string;
}

interface ProgressStats {
  avgBirdies: number;
  avgPars: number;
  avgBogeys: number;
  avgDoublePlus: number;
  par3Avg: number;
  par4Avg: number;
  par5Avg: number;
  blowUpFrequency: number;
  consistencyScore: number;
  bestToPar: number;
}

function calculateProgressStats(rounds: PlayerRound[]): ProgressStats | null {
  const validRounds = rounds.filter(r => r.scorecard?.holeData);
  if (validRounds.length === 0) return null;

  let totalBirdies = 0;
  let totalPars = 0;
  let totalBogeys = 0;
  let totalDoublePlus = 0;
  let par3Scores: number[] = [];
  let par4Scores: number[] = [];
  let par5Scores: number[] = [];
  let blowUpHoles = 0;
  let totalHoles = 0;
  let roundScores: number[] = [];

  for (const round of validRounds) {
    const holeData = round.scorecard.holeData as HoleData;
    if (!holeData) continue;

    roundScores.push(round.scorecard.toPar_gross);

    for (let hole = 1; hole <= 18; hole++) {
      const par = holeData[`h${hole}_Par`] as number;
      const gross = holeData[`hole${hole}_gross`] as number;

      if (typeof par !== 'number' || typeof gross !== 'number') continue;

      totalHoles++;
      const scoreToPar = gross - par;

      if (scoreToPar <= -1) totalBirdies++;
      else if (scoreToPar === 0) totalPars++;
      else if (scoreToPar === 1) totalBogeys++;
      else totalDoublePlus++;

      if (scoreToPar >= 3) blowUpHoles++;

      if (par === 3) par3Scores.push(gross);
      else if (par === 4) par4Scores.push(gross);
      else if (par === 5) par5Scores.push(gross);
    }
  }

  const numRounds = validRounds.length;
  const avgScore = roundScores.reduce((a, b) => a + b, 0) / roundScores.length;

  const consistentRounds = roundScores.filter(s => Math.abs(s - avgScore) <= 5).length;

  return {
    avgBirdies: totalBirdies / numRounds,
    avgPars: totalPars / numRounds,
    avgBogeys: totalBogeys / numRounds,
    avgDoublePlus: totalDoublePlus / numRounds,
    par3Avg: par3Scores.length > 0 ? par3Scores.reduce((a, b) => a + b, 0) / par3Scores.length : 0,
    par4Avg: par4Scores.length > 0 ? par4Scores.reduce((a, b) => a + b, 0) / par4Scores.length : 0,
    par5Avg: par5Scores.length > 0 ? par5Scores.reduce((a, b) => a + b, 0) / par5Scores.length : 0,
    blowUpFrequency: totalHoles > 0 ? (blowUpHoles / totalHoles) * 100 : 0,
    consistencyScore: (consistentRounds / numRounds) * 100,
    bestToPar: Math.min(...roundScores),
  };
}

export default function LeagueProfile() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [rounds, setRounds] = useState<PlayerRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (authLoading || !user) return;

    async function loadProfile() {
      setIsLoading(true);
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name, first_name, email")
          .eq("user_id", user.id)
          .maybeSingle();

        setDisplayName(profile?.display_name || profile?.first_name || user.email?.split("@")[0] || "Golfer");
        setEmail(profile?.email || user.email || "");

        const [statsData, roundsData] = await Promise.all([
          sgtClient.getMemberStats().catch(() => null),
          sgtClient.getPlayerRounds().catch(() => []),
        ]);

        setStats(statsData);
        setRounds(roundsData);
      } catch (error) {
        console.error("Failed to load profile:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProfile();
  }, [user, authLoading]);

  const progressStats = useMemo(() => calculateProgressStats(rounds), [rounds]);

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 text-secondary animate-spin" />
      </div>
    );
  }

  const avgScore = rounds.length > 0
    ? Math.round(rounds.reduce((sum, r) => sum + r.scorecard.total_gross, 0) / rounds.length)
    : null;

  const bestRound = rounds.length > 0
    ? rounds.reduce((best, r) =>
        r.scorecard.total_gross < best.scorecard.total_gross ? r : best
      )
    : null;

  const completedRounds = rounds.filter(r => r.status === "Completed");

  return (
    <LeagueLayout>
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <div className="bg-card rounded-2xl border border-border overflow-hidden mb-8 animate-fade-in">
          <div className="hero-section p-6 md:p-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-anton text-4xl md:text-5xl shadow-lg">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="text-center md:text-left">
                <h1 className="font-anton text-3xl md:text-4xl text-primary-foreground mb-2">
                  {displayName.toUpperCase()}
                </h1>
                <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-primary-foreground/80 font-inter text-sm">
                  {email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-4 w-4" />
                      {email}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Handicap Banner */}
          <div className="bg-card p-6 border-t border-border">
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-sm font-inter text-muted-foreground mb-1">Current Handicap</p>
                <p className="font-anton text-5xl text-foreground">
                  {stats?.handicap ?? "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-secondary animate-spin" />
          </div>
        ) : (
          <>
            {/* Performance Stats */}
            <div className="mb-8 animate-slide-up" style={{ animationDelay: "100ms" }}>
              <h2 className="font-anton text-2xl text-foreground mb-4">
                PERFORMANCE STATS
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Average Score"
                  value={avgScore ?? "N/A"}
                  icon={<BarChart3 className="h-5 w-5" />}
                  delay={0}
                />
                {bestRound ? (
                  <Link to={`/league/rounds?round=${bestRound.tournamentId}-${bestRound.scorecard?.round || 0}`}>
                    <StatCard
                      label="Best Round"
                      value={bestRound.scorecard.total_gross}
                      subValue={bestRound.courseName}
                      icon={<TrendingDown className="h-5 w-5" />}
                      delay={100}
                      className="cursor-pointer hover:border-secondary transition-colors"
                    />
                  </Link>
                ) : (
                  <StatCard
                    label="Best Round"
                    value="N/A"
                    icon={<TrendingDown className="h-5 w-5" />}
                    delay={100}
                  />
                )}
                <StatCard
                  label="Tour Rank"
                  value={stats?.standing?.position ? `#${stats.standing.position}` : "N/A"}
                  subValue={stats?.standing ? `${stats.standing.points} points` : undefined}
                  icon={<Trophy className="h-5 w-5" />}
                  delay={200}
                />
                <StatCard
                  label="Rounds Played"
                  value={completedRounds.length}
                  subValue="Completed"
                  icon={<Target className="h-5 w-5" />}
                  delay={300}
                />
              </div>
            </div>

            {/* My Progress */}
            {progressStats && (
              <div className="mb-8 animate-slide-up" style={{ animationDelay: "150ms" }}>
                <h2 className="font-anton text-2xl text-foreground mb-4">
                  MY PROGRESS
                </h2>
                <div className="bg-card rounded-xl border border-border p-6">
                  {/* Scoring Breakdown */}
                  <div className="mb-6">
                    <h3 className="font-inter font-semibold text-foreground mb-4 flex items-center gap-2">
                      <CircleDot className="h-4 w-4 text-secondary" />
                      Average Per Round
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <ProgressStatCard
                        value={progressStats.avgBirdies.toFixed(1)}
                        label="Birdies"
                        explanation="The average number of birdies (one under par) you score per round. More birdies indicate strong scoring opportunities and good course management. Track this to see improvement in your scoring ability."
                        className="bg-birdie/10"
                        valueClassName="text-birdie"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.avgPars.toFixed(1)}
                        label="Pars"
                        explanation="The average number of pars you make per round. Pars are the foundation of good scoring - they keep your round steady and prevent big numbers. A higher par average shows solid, consistent play."
                        className="bg-muted"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.avgBogeys.toFixed(1)}
                        label="Bogeys"
                        explanation="The average number of bogeys (one over par) per round. Bogeys are recoverable mistakes. Reducing your bogey count is often the fastest way to lower your scores."
                        className="bg-bogey/10"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.avgDoublePlus.toFixed(1)}
                        label="Double+"
                        explanation="The average number of double bogeys or worse per round. These are the score killers - eliminating doubles and triples is crucial for breaking scoring barriers. Focus on course management to avoid these big numbers."
                        className="bg-double/10"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                    </div>
                  </div>

                  {/* Par Performance */}
                  <div className="mb-6">
                    <h3 className="font-inter font-semibold text-foreground mb-4 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-secondary" />
                      Par Performance
                    </h3>
                    <div className="grid grid-cols-3 gap-4">
                      <ProgressStatCard
                        value={progressStats.par3Avg.toFixed(1)}
                        label="Par 3 Avg"
                        subValue={`${progressStats.par3Avg - 3 > 0 ? '+' : ''}${(progressStats.par3Avg - 3).toFixed(1)} vs par`}
                        explanation="Your average score on Par 3 holes. These are the shortest holes where you hit directly at the green. A lower average here indicates strong iron play and accuracy. Tour average is around 3.1."
                        className="bg-muted/50"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.par4Avg.toFixed(1)}
                        label="Par 4 Avg"
                        subValue={`${progressStats.par4Avg - 4 > 0 ? '+' : ''}${(progressStats.par4Avg - 4).toFixed(1)} vs par`}
                        explanation="Your average score on Par 4 holes, which make up most of any course. Strong Par 4 play requires good driving and approach shots. This is often where handicaps are made or broken."
                        className="bg-muted/50"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                      <ProgressStatCard
                        value={progressStats.par5Avg.toFixed(1)}
                        label="Par 5 Avg"
                        subValue={`${progressStats.par5Avg - 5 > 0 ? '+' : ''}${(progressStats.par5Avg - 5).toFixed(1)} vs par`}
                        explanation="Your average score on Par 5 holes, the longest holes on the course. These are birdie opportunities for longer hitters. Scoring well here can significantly boost your overall round."
                        className="bg-muted/50"
                        valueClassName="text-foreground"
                        variant="compact"
                      />
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <ProgressStatCard
                      value={progressStats.bestToPar === 0 ? 'E' : progressStats.bestToPar > 0 ? `+${progressStats.bestToPar}` : progressStats.bestToPar}
                      label="Best To Par"
                      explanation="Your best score relative to par across all recorded rounds. This represents your peak performance and shows what you are capable of achieving. Use this as motivation - you have done it before!"
                      className="bg-muted/30"
                      valueClassName="text-foreground"
                      icon={<div className="w-10 h-10 rounded-full bg-secondary/20 flex items-center justify-center"><Award className="h-5 w-5 text-secondary" /></div>}
                    />
                    <ProgressStatCard
                      value={`${progressStats.blowUpFrequency.toFixed(1)}%`}
                      label="Blow-up Holes"
                      explanation="The percentage of holes where you scored triple bogey or worse. These disaster holes can wreck an otherwise good round. Reducing blow-ups through smart course management is one of the fastest ways to lower your handicap."
                      className="bg-muted/30"
                      valueClassName="text-foreground"
                      icon={<div className="w-10 h-10 rounded-full bg-bogey/20 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-bogey" /></div>}
                    />
                    <ProgressStatCard
                      value={`${progressStats.consistencyScore.toFixed(0)}%`}
                      label="Consistency"
                      explanation="The percentage of your rounds that fall within 5 shots of your average score. Higher consistency means more predictable performances with fewer extreme highs and lows. Consistent golfers tend to have lower handicaps."
                      className="bg-muted/30"
                      valueClassName="text-foreground"
                      icon={<div className="w-10 h-10 rounded-full bg-birdie/20 flex items-center justify-center"><Gauge className="h-5 w-5 text-birdie" /></div>}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Tour Performance */}
            {stats?.standing && (
              <div className="mb-8 animate-slide-up" style={{ animationDelay: "200ms" }}>
                <h2 className="font-anton text-2xl text-foreground mb-4">
                  TOUR PERFORMANCE
                </h2>
                <div className="bg-card rounded-xl border border-border p-6">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
                    <div>
                      <p className="text-3xl font-anton text-foreground">{stats.standing.events}</p>
                      <p className="text-sm font-inter text-muted-foreground">Events</p>
                    </div>
                    <div>
                      <p className="text-3xl font-anton text-secondary">{stats.standing.first || 0}</p>
                      <p className="text-sm font-inter text-muted-foreground">Wins</p>
                    </div>
                    <div>
                      <p className="text-3xl font-anton text-foreground">{stats.standing.top5 || 0}</p>
                      <p className="text-sm font-inter text-muted-foreground">Top 5</p>
                    </div>
                    <div>
                      <p className="text-3xl font-anton text-foreground">{stats.standing.top10 || 0}</p>
                      <p className="text-sm font-inter text-muted-foreground">Top 10</p>
                    </div>
                    <div>
                      <p className="text-3xl font-anton text-secondary">{stats.standing.points}</p>
                      <p className="text-sm font-inter text-muted-foreground">Points</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </LeagueLayout>
  );
}
