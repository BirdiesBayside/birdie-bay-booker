import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";
import { format } from "date-fns";
import { formatLocalHcp } from "@/lib/utils";

export function CompResults() {
  const [selectedCompId, setSelectedCompId] = useState<string>("");

  const { data: competitions } = useQuery({
    queryKey: ["local-competitions-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Auto-select latest competition when data loads
  useEffect(() => {
    if (competitions && competitions.length > 0 && !selectedCompId) {
      setSelectedCompId(competitions[0].id);
    }
  }, [competitions, selectedCompId]);

  const { data: teams } = useQuery({
    queryKey: ["local-comp-teams-results", selectedCompId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_teams")
        .select("*")
        .eq("competition_id", selectedCompId)
        .order("position", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCompId,
  });

  const sortedTeams = useMemo(() => {
    if (!teams) return [];
    return [...teams].sort((a, b) => {
      if (a.position && b.position) return a.position - b.position;
      if (a.net_score === null && b.net_score === null) return 0;
      if (a.net_score === null) return 1;
      if (b.net_score === null) return -1;
      if (a.net_score === b.net_score) {
        const g = (a.gross_score || 999) - (b.gross_score || 999);
        if (g !== 0) return g;
        return (a.position || 999) - (b.position || 999);
      }
      return a.net_score - b.net_score;
    });
  }, [teams]);

  const selectedComp = competitions?.find((c) => c.id === selectedCompId);

  return (
    <div className="space-y-6">
      <div className="w-64">
        <Select value={selectedCompId} onValueChange={setSelectedCompId}>
          <SelectTrigger>
            <SelectValue placeholder="Select competition" />
          </SelectTrigger>
          <SelectContent>
            {competitions?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} ({c.date})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCompId && selectedComp && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">{selectedComp.name}</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {format(new Date(selectedComp.date + "T00:00:00"), "EEEE dd MMMM yyyy")} · 2-Man Ambrose · ${selectedComp.entry_fee} entry
                </p>
              </div>
              <Badge variant="outline" className={selectedComp.status === "completed" ? "bg-muted" : "bg-green-500/10 text-green-500"}>
                {selectedComp.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {sortedTeams.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <p>No teams registered for this competition.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-center">Pos</TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Players</TableHead>
                    <TableHead className="text-center">HCP</TableHead>
                    <TableHead className="text-center">Gross</TableHead>
                    <TableHead className="text-center">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTeams.map((team, idx) => (
                    <TableRow key={team.id} className={idx === 0 && team.net_score !== null ? "bg-primary/5" : ""}>
                      <TableCell className="text-center">
                        {idx === 0 && team.net_score !== null ? (
                          <div className="flex items-center justify-center">
                            <Trophy className="h-5 w-5 text-yellow-500" />
                          </div>
                        ) : (
                          <span className="font-bold text-muted-foreground">{team.position || idx + 1}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-semibold">{team.team_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {team.player1_name} & {team.player2_name}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">{formatLocalHcp(team.combined_handicap)}</Badge>
                      </TableCell>
                      <TableCell className="text-center">{team.gross_score ?? "-"}</TableCell>
                      <TableCell className="text-center font-bold">{team.net_score ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
