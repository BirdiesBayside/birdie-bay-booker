import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, FileText } from "lucide-react";

export function SGTScorecards() {
  const [searchQuery, setSearchQuery] = useState("");
  const [tournamentFilter, setTournamentFilter] = useState("all");

  // Fetch scorecards
  const { data: scorecards, isLoading } = useQuery({
    queryKey: ["sgt-scorecards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_scorecards")
        .select("*")
        .order("tournament_id", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  // Fetch tournaments for filter
  const { data: tournaments } = useQuery({
    queryKey: ["sgt-tournaments-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("tournament_id, name")
        .order("start_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const filteredScorecards = scorecards?.filter((scorecard) => {
    const matchesSearch = scorecard.player_name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    
    const matchesTournament =
      tournamentFilter === "all" ||
      scorecard.tournament_id.toString() === tournamentFilter;

    return matchesSearch && matchesTournament;
  });

  const formatScore = (score: number | null, par?: number) => {
    if (score === null) return "-";
    if (par && score !== par) {
      const diff = score - par;
      const sign = diff > 0 ? "+" : "";
      return `${score} (${sign}${diff})`;
    }
    return score.toString();
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by player name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={tournamentFilter} onValueChange={setTournamentFilter}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Tournament" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tournaments</SelectItem>
            {tournaments?.map((tournament) => (
              <SelectItem
                key={tournament.tournament_id}
                value={tournament.tournament_id.toString()}
              >
                {tournament.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Scorecards Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredScorecards && filteredScorecards.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Round</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">HCP</TableHead>
                  <TableHead>Tee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredScorecards.map((scorecard) => (
                  <TableRow key={scorecard.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{scorecard.player_name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {scorecard.player_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {scorecard.course_name || "-"}
                    </TableCell>
                    <TableCell>{scorecard.round || 1}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatScore(scorecard.total_gross)}
                      {scorecard.to_par_gross !== null && (
                        <span
                          className={`ml-1 text-xs ${
                            scorecard.to_par_gross < 0
                              ? "text-green-600"
                              : scorecard.to_par_gross > 0
                              ? "text-red-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          ({scorecard.to_par_gross > 0 ? "+" : ""}
                          {scorecard.to_par_gross})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatScore(scorecard.total_net)}
                    </TableCell>
                    <TableCell className="text-right">
                      {scorecard.hcp_index?.toFixed(1) ?? "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {scorecard.teetype || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No scorecards found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
