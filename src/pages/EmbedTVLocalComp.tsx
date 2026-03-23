import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Trophy } from "lucide-react";
import { format } from "date-fns";

export default function EmbedTVLocalComp() {
  // Auto-refresh every 30 seconds
  const { data: competition } = useQuery({
    queryKey: ["tv-local-comp-active"],
    queryFn: async () => {
      // Get most recent active or completed comp
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .in("status", ["active", "completed"])
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: teams } = useQuery({
    queryKey: ["tv-local-comp-teams", competition?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_teams")
        .select("*")
        .eq("competition_id", competition!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!competition?.id,
    refetchInterval: 30000,
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!competition?.id) return;
    const channel = supabase
      .channel("tv-local-comp")
      .on("postgres_changes", { event: "*", schema: "public", table: "local_comp_teams", filter: `competition_id=eq.${competition.id}` }, () => {
        // Will trigger refetch via queryClient
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [competition?.id]);

  const sortedTeams = useMemo(() => {
    if (!teams) return [];
    return [...teams].sort((a, b) => {
      if (a.net_score === null && b.net_score === null) return 0;
      if (a.net_score === null) return 1;
      if (b.net_score === null) return -1;
      if (a.net_score === b.net_score) return (a.gross_score || 999) - (b.gross_score || 999);
      return a.net_score - b.net_score;
    });
  }, [teams]);

  if (!competition) {
    return (
      <div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center">
        <p className="text-white/50 text-2xl">No active competition</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-[hsl(18,84%,55%)] tracking-tight" style={{ fontFamily: "'Anton', sans-serif" }}>
          {competition.name}
        </h1>
        <p className="text-xl text-white/60 mt-2">
          {format(new Date(competition.date + "T00:00:00"), "EEEE dd MMMM yyyy")} · 2-Man Ambrose
        </p>
      </div>

      {/* Leaderboard */}
      <div className="max-w-4xl mx-auto">
        {/* Header Row */}
        <div className="grid grid-cols-12 gap-2 px-4 py-3 text-sm uppercase tracking-wider text-white/40 border-b border-white/10">
          <div className="col-span-1 text-center">Pos</div>
          <div className="col-span-4">Team</div>
          <div className="col-span-3">Players</div>
          <div className="col-span-1 text-center">HCP</div>
          <div className="col-span-1 text-center">Gross</div>
          <div className="col-span-2 text-center">Net</div>
        </div>

        {sortedTeams.map((team, idx) => {
          const isWinner = idx === 0 && team.net_score !== null && competition.status === "completed";
          return (
            <div
              key={team.id}
              className={`grid grid-cols-12 gap-2 px-4 py-4 items-center border-b border-white/5 ${
                isWinner ? "bg-[hsl(18,84%,55%)]/10 border-[hsl(18,84%,55%)]/20" : idx % 2 === 0 ? "bg-white/[0.02]" : ""
              }`}
            >
              <div className="col-span-1 text-center text-2xl font-bold">
                {isWinner ? <Trophy className="h-7 w-7 text-yellow-400 mx-auto" /> : (
                  <span className="text-white/50">{team.position || idx + 1}</span>
                )}
              </div>
              <div className="col-span-4">
                <span className={`text-xl font-bold ${isWinner ? "text-[hsl(18,84%,55%)]" : ""}`}>
                  {team.team_name}
                </span>
              </div>
              <div className="col-span-3 text-white/60 text-sm">
                {team.player1_name} & {team.player2_name}
              </div>
              <div className="col-span-1 text-center text-white/40">
                {team.combined_handicap.toFixed(1)}
              </div>
              <div className="col-span-1 text-center text-lg">
                {team.gross_score ?? "-"}
              </div>
              <div className="col-span-2 text-center">
                <span className={`text-2xl font-bold ${isWinner ? "text-[hsl(18,84%,55%)]" : "text-[hsl(142,71%,45%)]"}`}>
                  {team.net_score !== null ? team.net_score : "-"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
