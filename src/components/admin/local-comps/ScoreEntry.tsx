import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Check, DollarSign, ShoppingCart } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function ScoreEntry() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCompId, setSelectedCompId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [p1Name, setP1Name] = useState("");
  const [p1Hcp, setP1Hcp] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p2Hcp, setP2Hcp] = useState("");

  const { data: competitions } = useQuery({
    queryKey: ["local-competitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .in("status", ["upcoming", "active"])
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: teams, isLoading: teamsLoading } = useQuery({
    queryKey: ["local-comp-teams", selectedCompId],
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

  // Realtime subscription for payment updates
  useEffect(() => {
    if (!selectedCompId) return;
    const channel = supabase
      .channel(`local-comp-teams-${selectedCompId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'local_comp_teams', filter: `competition_id=eq.${selectedCompId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedCompId, queryClient]);

  // Debounced score entry
  const scoreTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [localScores, setLocalScores] = useState<Record<string, string>>({});

  const handleScoreChange = useCallback((teamId: string, value: string) => {
    setLocalScores(prev => ({ ...prev, [teamId]: value }));
    if (scoreTimers.current[teamId]) clearTimeout(scoreTimers.current[teamId]);
    scoreTimers.current[teamId] = setTimeout(() => {
      const grossScore = value === "" ? null : parseInt(value);
      updateScoreMutation.mutate({ teamId, grossScore });
    }, 1000);
  }, []);

  const combinedHcpPreview = useMemo(() => {
    const h1 = parseFloat(p1Hcp) || 0;
    const h2 = parseFloat(p2Hcp) || 0;
    return (h1 + h2) / 4;
  }, [p1Hcp, p2Hcp]);

  const autoTeamName = useMemo(() => {
    if (teamName) return teamName;
    if (p1Name && p2Name) {
      const last1 = p1Name.split(" ").pop() || p1Name;
      const last2 = p2Name.split(" ").pop() || p2Name;
      return `${last1} & ${last2}`;
    }
    return "";
  }, [teamName, p1Name, p2Name]);

  const addTeamMutation = useMutation({
    mutationFn: async () => {
      const h1 = parseFloat(p1Hcp) || 0;
      const h2 = parseFloat(p2Hcp) || 0;
      const combined = (h1 + h2) / 4;
      const { error } = await supabase.from("local_comp_teams").insert({
        competition_id: selectedCompId,
        team_name: autoTeamName,
        player1_name: p1Name,
        player1_handicap: h1,
        player2_name: p2Name,
        player2_handicap: h2,
        combined_handicap: combined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
      toast({ title: "Team added", duration: 3000 });
      setDialogOpen(false);
      setTeamName("");
      setP1Name("");
      setP1Hcp("");
      setP2Name("");
      setP2Hcp("");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateScoreMutation = useMutation({
    mutationFn: async ({ teamId, grossScore }: { teamId: string; grossScore: number | null }) => {
      const team = teams?.find((t) => t.id === teamId);
      if (!team) return;
      const netScore = grossScore !== null ? grossScore - Math.floor(team.combined_handicap) : null;
      const { error } = await supabase
        .from("local_comp_teams")
        .update({ gross_score: grossScore, net_score: netScore })
        .eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
    },
  });

  // Remove togglePaidMutation - paid status is now managed via POS
  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const { error } = await supabase.from("local_comp_teams").delete().eq("id", teamId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
      toast({ title: "Team removed", duration: 3000 });
    },
  });

  const calculatePositionsMutation = useMutation({
    mutationFn: async () => {
      if (!teams) return;
      const scored = teams
        .filter((t) => t.net_score !== null)
        .sort((a, b) => {
          if (a.net_score === b.net_score) return (a.gross_score || 999) - (b.gross_score || 999);
          return (a.net_score || 999) - (b.net_score || 999);
        });
      
      for (let i = 0; i < scored.length; i++) {
        await supabase
          .from("local_comp_teams")
          .update({ position: i + 1 })
          .eq("id", scored[i].id);
      }
      // Clear position for unscored teams
      const unscoredIds = teams.filter((t) => t.net_score === null).map((t) => t.id);
      if (unscoredIds.length > 0) {
        await supabase
          .from("local_comp_teams")
          .update({ position: null })
          .in("id", unscoredIds);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
      toast({ title: "Positions calculated!", duration: 3000 });
    },
  });

  // Sort teams: by net_score ascending (nulls last)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
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

        {selectedCompId && (
          <>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Add Team</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Register Team</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>Team Name (optional)</Label>
                    <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={autoTeamName || "Auto-generated from player names"} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Player 1 Name</Label>
                      <Input value={p1Name} onChange={(e) => setP1Name(e.target.value)} placeholder="Name" />
                    </div>
                    <div>
                      <Label>Player 1 Handicap</Label>
                      <Input type="number" value={p1Hcp} onChange={(e) => setP1Hcp(e.target.value)} placeholder="0" step="0.1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Player 2 Name</Label>
                      <Input value={p2Name} onChange={(e) => setP2Name(e.target.value)} placeholder="Name" />
                    </div>
                    <div>
                      <Label>Player 2 Handicap</Label>
                      <Input type="number" value={p2Hcp} onChange={(e) => setP2Hcp(e.target.value)} placeholder="0" step="0.1" />
                    </div>
                  </div>
                  <Card className="bg-muted/50">
                    <CardContent className="p-3 text-sm">
                      <p>Combined HCP: ({p1Hcp || "0"} + {p2Hcp || "0"}) ÷ 4 = <strong>{combinedHcpPreview.toFixed(1)}</strong></p>
                      <p className="text-muted-foreground">Strokes applied: {Math.floor(combinedHcpPreview)}</p>
                    </CardContent>
                  </Card>
                  <Button
                    className="w-full"
                    onClick={() => addTeamMutation.mutate()}
                    disabled={!p1Name || !p2Name || addTeamMutation.isPending}
                  >
                    {addTeamMutation.isPending ? "Adding..." : "Add Team"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {sortedTeams.length > 0 && (
              <Button variant="outline" onClick={() => calculatePositionsMutation.mutate()} disabled={calculatePositionsMutation.isPending}>
                Calculate Positions
              </Button>
            )}
          </>
        )}
      </div>

      {selectedCompId && (
        teamsLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        ) : sortedTeams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <p>No teams registered yet. Add teams to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Teams & Scores</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Team</TableHead>
                      <TableHead>Players</TableHead>
                      <TableHead className="text-center w-20">HCP</TableHead>
                      <TableHead className="text-center w-20">Gross</TableHead>
                      <TableHead className="text-center w-16">Net</TableHead>
                      <TableHead className="text-center">Payment</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedTeams.map((team, idx) => (
                      <TableRow key={team.id} className={team.position === 1 ? "bg-primary/5" : ""}>
                        <TableCell className="font-bold text-muted-foreground">
                          {team.position || idx + 1}
                        </TableCell>
                        <TableCell className="font-medium">{team.team_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {team.player1_name} ({team.player1_handicap}) & {team.player2_name} ({team.player2_handicap})
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="font-mono">
                            {team.combined_handicap.toFixed(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            className="w-20 text-center mx-auto h-8"
                            value={localScores[team.id] !== undefined ? localScores[team.id] : (team.gross_score ?? "")}
                            onChange={(e) => handleScoreChange(team.id, e.target.value)}
                            placeholder="-"
                          />
                        </TableCell>
                        <TableCell className="text-center font-bold">
                          {team.net_score !== null ? team.net_score : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {team.player1_paid && team.player2_paid ? (
                              <Badge className="bg-green-500/10 text-green-600 border-green-200">
                                <Check className="h-3 w-3 mr-1" /> Paid
                              </Badge>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {!team.player1_paid ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => {
                                      const comp = competitions?.find((c) => c.id === selectedCompId);
                                      const halfFee = (comp?.entry_fee || 10) / 2;
                                      navigate("/admin/pos", {
                                        state: {
                                          localCompData: {
                                            teamId: team.id,
                                            competitionId: selectedCompId,
                                            teamName: team.team_name,
                                            entryFee: halfFee,
                                            compName: comp?.name || "Local Comp",
                                            playerNumber: 1,
                                            playerName: team.player1_name,
                                          },
                                        },
                                      });
                                    }}
                                  >
                                    <ShoppingCart className="h-3 w-3" />
                                    {team.player1_name.split(" ").pop()}
                                  </Button>
                                ) : (
                                  <Badge variant="outline" className="text-green-600 text-xs">
                                    <Check className="h-3 w-3 mr-1" />{team.player1_name.split(" ").pop()}
                                  </Badge>
                                )}
                                {!team.player2_paid ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1"
                                    onClick={() => {
                                      const comp = competitions?.find((c) => c.id === selectedCompId);
                                      const halfFee = (comp?.entry_fee || 10) / 2;
                                      navigate("/admin/pos", {
                                        state: {
                                          localCompData: {
                                            teamId: team.id,
                                            competitionId: selectedCompId,
                                            teamName: team.team_name,
                                            entryFee: halfFee,
                                            compName: comp?.name || "Local Comp",
                                            playerNumber: 2,
                                            playerName: team.player2_name,
                                          },
                                        },
                                      });
                                    }}
                                  >
                                    <ShoppingCart className="h-3 w-3" />
                                    {team.player2_name.split(" ").pop()}
                                  </Button>
                                ) : (
                                  <Badge variant="outline" className="text-green-600 text-xs">
                                    <Check className="h-3 w-3 mr-1" />{team.player2_name.split(" ").pop()}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => deleteTeamMutation.mutate(team.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )
      )}

      {selectedCompId && sortedTeams.length > 0 && (() => {
        const comp = competitions?.find((c) => c.id === selectedCompId);
        const halfFee = (comp?.entry_fee || 10) / 2;
        const playersPaid = sortedTeams.reduce((sum, t) => sum + (t.player1_paid ? 1 : 0) + (t.player2_paid ? 1 : 0), 0);
        const totalPlayers = sortedTeams.length * 2;
        return (
          <Card className="bg-muted/30">
            <CardContent className="p-4 flex items-center gap-4 text-sm">
              <DollarSign className="h-5 w-5 text-green-500" />
              <span>
                <strong>{playersPaid}</strong> of{" "}
                <strong>{totalPlayers}</strong> players paid
              </span>
              <span className="text-muted-foreground">
                (${(playersPaid * halfFee).toFixed(2)} collected)
              </span>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
