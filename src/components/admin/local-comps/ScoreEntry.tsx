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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Check, DollarSign, ShoppingCart, Search, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ScoreEntry() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedCompId, setSelectedCompId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savedTeamOpen, setSavedTeamOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [p1Name, setP1Name] = useState("");
  const [p1Hcp, setP1Hcp] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [p2Hcp, setP2Hcp] = useState("");

  // Query saved teams ONLY — single source of truth for current local handicaps.
  // (Previously merged with local_comp_teams which caused stale base-handicaps to be loaded.)
  const { data: savedTeams } = useQuery({
    queryKey: ["saved-local-comp-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_saved_teams")
        .select("team_name, player1_name, player1_handicap, player1_local_hcp, player2_name, player2_handicap, player2_local_hcp")
        .eq("is_active", true)
        .order("team_name", { ascending: true });
      if (error) throw error;
      return (data || []).map((t) => ({
        team_name: t.team_name,
        player1_name: t.player1_name,
        player1_base_hcp: Number(t.player1_handicap) || 0,
        player1_local_hcp: Number(t.player1_local_hcp ?? t.player1_handicap) || 0,
        player2_name: t.player2_name,
        player2_base_hcp: Number(t.player2_handicap) || 0,
        player2_local_hcp: Number(t.player2_local_hcp ?? t.player2_handicap) || 0,
      }));
    },
  });

  // Realtime: refresh saved teams when the winner's-tax trigger updates local hcps
  useEffect(() => {
    const channel = supabase
      .channel('saved-teams-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'local_comp_saved_teams' }, () => {
        queryClient.invalidateQueries({ queryKey: ["saved-local-comp-teams"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

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

  // Auto-select latest competition when data loads
  useEffect(() => {
    if (competitions && competitions.length > 0 && !selectedCompId) {
      setSelectedCompId(competitions[0].id);
    }
  }, [competitions, selectedCompId]);

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

      // Auto-sync handicaps from Saved Teams whenever a score is entered.
      // This guarantees the team's HCP reflects any Winner's Tax adjustments
      // that happened since the team was registered.
      const norm = (s: string) => (s || "").trim().toLowerCase();
      let p1Hcp = Number(team.player1_handicap) || 0;
      let p2Hcp = Number(team.player2_handicap) || 0;
      let combined = Number(team.combined_handicap) || 0;
      let syncedFromSaved = false;

      if (grossScore !== null) {
        // Look for an exact saved-team match on the player pair (order-insensitive)
        const { data: savedMatches } = await supabase
          .from("local_comp_saved_teams")
          .select("id, team_name, player1_name, player1_handicap, player1_local_hcp, player2_name, player2_handicap, player2_local_hcp");

        const saved = (savedMatches || []).find((s: any) =>
          (norm(s.player1_name) === norm(team.player1_name) && norm(s.player2_name) === norm(team.player2_name)) ||
          (norm(s.player1_name) === norm(team.player2_name) && norm(s.player2_name) === norm(team.player1_name))
        );

        if (saved) {
          // Apply latest local HCPs to this team (mapping player order correctly)
          const p1IsSavedP1 = norm(saved.player1_name) === norm(team.player1_name);
          p1Hcp = Number(p1IsSavedP1 ? saved.player1_local_hcp : saved.player2_local_hcp) || 0;
          p2Hcp = Number(p1IsSavedP1 ? saved.player2_local_hcp : saved.player1_local_hcp) || 0;
          combined = (p1Hcp + p2Hcp) / 4;
          syncedFromSaved = true;
        } else if (team.player1_name && team.player2_name) {
          // No saved team yet — create one so future adjustments track this pair
          await supabase.from("local_comp_saved_teams").insert({
            team_name: team.team_name || `${team.player1_name} & ${team.player2_name}`,
            player1_name: team.player1_name,
            player1_handicap: p1Hcp,
            player1_local_hcp: p1Hcp,
            player2_name: team.player2_name,
            player2_handicap: p2Hcp,
            player2_local_hcp: p2Hcp,
          });
        }
      }

      const netScore = grossScore !== null ? grossScore - Math.floor(combined) : null;

      const updatePayload: Record<string, any> = { gross_score: grossScore, net_score: netScore };
      if (syncedFromSaved) {
        updatePayload.player1_handicap = p1Hcp;
        updatePayload.player2_handicap = p2Hcp;
        updatePayload.combined_handicap = combined;
      }

      const { error } = await supabase
        .from("local_comp_teams")
        .update(updatePayload)
        .eq("id", teamId);
      if (error) throw error;

      return { syncedFromSaved };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
      queryClient.invalidateQueries({ queryKey: ["saved-local-comp-teams"] });
      if (res?.syncedFromSaved) {
        toast({ title: "Handicaps synced", description: "Updated from Saved Teams.", duration: 2500 });
      }
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

  // Refresh handicaps for already-registered teams in this comp from saved teams' current local HCP
  const refreshHcpsMutation = useMutation({
    mutationFn: async () => {
      if (!teams || !savedTeams) return { updated: 0, skipped: 0 };
      let updated = 0;
      let skipped = 0;
      const norm = (s: string) => s.trim().toLowerCase();
      for (const team of teams) {
        const saved = savedTeams.find((s) =>
          (norm(s.player1_name) === norm(team.player1_name) && norm(s.player2_name) === norm(team.player2_name)) ||
          (norm(s.player1_name) === norm(team.player2_name) && norm(s.player2_name) === norm(team.player1_name))
        );
        if (!saved) { skipped++; continue; }
        const p1Local = norm(saved.player1_name) === norm(team.player1_name) ? saved.player1_local_hcp : saved.player2_local_hcp;
        const p2Local = norm(saved.player1_name) === norm(team.player1_name) ? saved.player2_local_hcp : saved.player1_local_hcp;
        const combined = (p1Local + p2Local) / 4;
        const netScore = team.gross_score !== null ? team.gross_score - Math.floor(combined) : null;
        const { error } = await supabase
          .from("local_comp_teams")
          .update({
            player1_handicap: p1Local,
            player2_handicap: p2Local,
            combined_handicap: combined,
            net_score: netScore,
          })
          .eq("id", team.id);
        if (error) throw error;
        updated++;
      }
      return { updated, skipped };
    },
    onSuccess: ({ updated, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
      toast({
        title: "Handicaps refreshed",
        description: `${updated} team(s) updated from Saved Teams${skipped ? `, ${skipped} not found` : ""}.`,
        duration: 4000,
      });
    },
    onError: (err: any) => {
      toast({ title: "Refresh failed", description: err.message, variant: "destructive" });
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
                  {/* Saved teams picker */}
                  <div>
                    <Label>Load Previous Team</Label>
                    <Popover open={savedTeamOpen} onOpenChange={setSavedTeamOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start gap-2 font-normal text-muted-foreground">
                          <Search className="h-4 w-4" />
                          Search saved teams...
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                        <Command>
                          <CommandInput placeholder="Search by player or team name..." />
                          <CommandList>
                            <CommandEmpty>No saved teams found.</CommandEmpty>
                            <CommandGroup>
                              {savedTeams?.map((t, idx) => (
                                <CommandItem
                                  key={`${t.player1_name}-${t.player2_name}-${idx}`}
                                  value={`${t.team_name} ${t.player1_name} ${t.player2_name}`}
                                  onSelect={() => {
                                    setTeamName(t.team_name);
                                    setP1Name(t.player1_name);
                                    setP1Hcp(String(t.player1_local_hcp));
                                    setP2Name(t.player2_name);
                                    setP2Hcp(String(t.player2_local_hcp));
                                    setSavedTeamOpen(false);
                                  }}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{t.team_name}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {t.player1_name} — Local <strong className="text-foreground">{t.player1_local_hcp.toFixed(1)}</strong>
                                      {t.player1_local_hcp !== t.player1_base_hcp && (
                                        <span className="opacity-60"> (base {t.player1_base_hcp})</span>
                                      )}
                                      {" & "}
                                      {t.player2_name} — Local <strong className="text-foreground">{t.player2_local_hcp.toFixed(1)}</strong>
                                      {t.player2_local_hcp !== t.player2_base_hcp && (
                                        <span className="opacity-60"> (base {t.player2_base_hcp})</span>
                                      )}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
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

            <Button
              variant="outline"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["local-comp-teams", selectedCompId] });
                toast({ title: "Refreshed", duration: 2000 });
              }}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>

            {sortedTeams.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => refreshHcpsMutation.mutate()}
                  disabled={refreshHcpsMutation.isPending}
                  className="gap-2"
                  title="Pull each team's current Local HCP from Saved Teams and recalculate combined handicap + net score"
                >
                  <RefreshCw className="h-4 w-4" />
                  {refreshHcpsMutation.isPending ? "Refreshing..." : "Refresh HCPs from Saved"}
                </Button>
                <Button variant="outline" onClick={() => calculatePositionsMutation.mutate()} disabled={calculatePositionsMutation.isPending}>
                  Calculate Positions
                </Button>
              </>
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
                                {!team.player1_paid && !team.player2_paid && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1 border-primary/30 text-primary"
                                    onClick={() => {
                                      const comp = competitions?.find((c) => c.id === selectedCompId);
                                      const fullFee = comp?.entry_fee || 10;
                                      navigate("/admin/pos", {
                                        state: {
                                          localCompData: {
                                            teamId: team.id,
                                            competitionId: selectedCompId,
                                            teamName: team.team_name,
                                            entryFee: fullFee,
                                            compName: comp?.name || "Local Comp",
                                          },
                                        },
                                      });
                                    }}
                                  >
                                    <ShoppingCart className="h-3 w-3" />
                                    Both
                                  </Button>
                                )}
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
