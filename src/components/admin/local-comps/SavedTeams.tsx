import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users, User, ChevronDown } from "lucide-react";

interface Player {
  id: string;
  name: string;
  name_normalized: string;
  handicap: number;
}

interface SavedTeam {
  id: string;
  team_name: string;
  player1_name: string;
  player2_name: string;
  is_active: boolean;
}

const norm = (s: string) => (s || "").trim().toLowerCase();

export function SavedTeams() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  const [playersOpen, setPlayersOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);

  // ---------------- Team add ----------------
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newPlayer1, setNewPlayer1] = useState("");
  const [newPlayer2, setNewPlayer2] = useState("");

  // ---------------- Players ----------------
  const [playerDialogOpen, setPlayerDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerHcp, setPlayerHcp] = useState("0");

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ["local-comp-players"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_players")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Player[];
    },
  });

  const savePlayerMutation = useMutation({
    mutationFn: async () => {
      const name = playerName.trim();
      const hcp = parseFloat(playerHcp) || 0;
      if (!name) throw new Error("Name is required");

      if (editingPlayer) {
        const query = supabase.from("local_comp_players").update({ handicap: hcp });
        // Prefer id; fall back to normalized name so a missing/stale id can't break the edit.
        const { error, data } = editingPlayer.id
          ? await query.eq("id", editingPlayer.id).select("id")
          : await query.eq("name_normalized", norm(editingPlayer.name)).select("id");
        if (error) throw error;
        if (!data || data.length === 0) {
          // Last-resort fallback by normalized name (in case id pointed to a deleted row)
          const { error: fbErr } = await supabase
            .from("local_comp_players")
            .update({ handicap: hcp })
            .eq("name_normalized", norm(editingPlayer.name));
          if (fbErr) throw fbErr;
        }
      } else {
        const { error } = await supabase
          .from("local_comp_players")
          .insert({ name, name_normalized: norm(name), handicap: hcp });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-players"] });
      toast.success(editingPlayer ? "Player updated" : "Player added");
      closePlayerDialog();
    },
    onError: (err: Error) => {
      console.error("savePlayerMutation error:", err);
      toast.error(err.message);
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("local_comp_players").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-players"] });
      toast.success("Player removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreatePlayer() {
    setEditingPlayer(null);
    setPlayerName("");
    setPlayerHcp("0");
    setPlayerDialogOpen(true);
  }
  function openEditPlayer(p: Player) {
    setEditingPlayer(p);
    setPlayerName(p.name);
    setPlayerHcp(String(p.handicap));
    setPlayerDialogOpen(true);
  }
  function closePlayerDialog() {
    setPlayerDialogOpen(false);
    setEditingPlayer(null);
  }

  // ---------------- Teams (read-only roster) ----------------
  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["local-comp-saved-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_saved_teams")
        .select("id, team_name, player1_name, player2_name, is_active")
        .eq("is_active", true)
        .order("team_name", { ascending: true });
      if (error) throw error;
      return data as SavedTeam[];
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("local_comp_saved_teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-saved-teams"] });
      toast.success("Team deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const addTeamMutation = useMutation({
    mutationFn: async () => {
      const p1 = newPlayer1.trim();
      const p2 = newPlayer2.trim();
      const name = newTeamName.trim();
      if (!p1 || !p2 || !name) throw new Error("All fields are required");

      const p1Lower = p1.toLowerCase();
      const p2Lower = p2.toLowerCase();
      const { data: existing } = await supabase
        .from("local_comp_saved_teams")
        .select("team_name, player1_name, player2_name");
      const duplicate = (existing || []).find((t) => {
        const a = (t.player1_name || "").trim().toLowerCase();
        const b = (t.player2_name || "").trim().toLowerCase();
        return (a === p1Lower && b === p2Lower) || (a === p2Lower && b === p1Lower);
      });
      if (duplicate) {
        throw new Error(`This pairing is already registered as "${duplicate.team_name}".`);
      }

      const { error: teamError } = await supabase.from("local_comp_saved_teams").insert({
        team_name: name,
        player1_name: p1,
        player2_name: p2,
        player1_handicap: 0,
        player2_handicap: 0,
      });
      if (teamError) throw teamError;

      for (const playerName of [p1, p2]) {
        const { error: playerErr } = await supabase.from("local_comp_players").insert({
          name: playerName,
          name_normalized: playerName.toLowerCase(),
          handicap: 0,
        });
        if (playerErr && !playerErr.message.toLowerCase().includes("duplicate")) {
          console.warn("Player insert warning:", playerErr.message);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-saved-teams"] });
      queryClient.invalidateQueries({ queryKey: ["local-comp-players"] });
      toast.success("Team added");
      setTeamDialogOpen(false);
      setNewTeamName("");
      setNewPlayer1("");
      setNewPlayer2("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Lookup map for player handicaps
  const playerHcpMap = useMemo(() => {
    const m = new Map<string, number>();
    players.forEach((p) => m.set(p.name_normalized, Number(p.handicap) || 0));
    return m;
  }, [players]);

  const filteredPlayers = players.filter((p) =>
    p.name.toLowerCase().includes(playerSearch.toLowerCase())
  );
  const filteredTeams = teams.filter(
    (t) =>
      t.team_name.toLowerCase().includes(search.toLowerCase()) ||
      t.player1_name.toLowerCase().includes(search.toLowerCase()) ||
      t.player2_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <Input
        placeholder="Search teams..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <HandicapMismatches />


      {/* TEAMS first, used most often */}

      {/* TEAMS, read-only pairings */}
      <Card>
        <Collapsible open={teamsOpen} onOpenChange={setTeamsOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" /> Teams ({teams.length})
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${teamsOpen ? "rotate-180" : ""}`}
                />
              </CardTitle>
              <Button
                size="sm"
                className="gap-2"
                onClick={(e) => {
                  e.stopPropagation();
                  setTeamDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Team
              </Button>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Player pairings are locked. To change a team's roster, delete the team and create a new one.
              </p>
              {teamsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : filteredTeams.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {search ? "No teams match." : "No teams yet."}
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredTeams.map((team) => {
                    const p1Hcp = playerHcpMap.get(norm(team.player1_name));
                    const p2Hcp = playerHcpMap.get(norm(team.player2_name));
                    const combined =
                      p1Hcp !== undefined && p2Hcp !== undefined ? (p1Hcp + p2Hcp) / 4 : null;
                    return (
                      <Card key={team.id}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-foreground">{team.team_name}</h3>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm(`Delete team "${team.team_name}"?`)) {
                                  deleteTeamMutation.mutate(team.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <p>
                              {team.player1_name},{" "}
                              {p1Hcp !== undefined ? (
                                <span className="font-semibold text-foreground">{p1Hcp.toFixed(1)}</span>
                              ) : (
                                <span className="text-destructive text-xs">no player record</span>
                              )}
                            </p>
                            <p>
                              {team.player2_name},{" "}
                              {p2Hcp !== undefined ? (
                                <span className="font-semibold text-foreground">{p2Hcp.toFixed(1)}</span>
                              ) : (
                                <span className="text-destructive text-xs">no player record</span>
                              )}
                            </p>
                            {combined !== null && (
                              <p className="text-xs font-medium pt-1">
                                Combined: {combined.toFixed(2)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>


      {/* PLAYERS, collapsible, single source of truth for handicaps */}
      <Card>
        <Collapsible open={playersOpen} onOpenChange={setPlayersOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors">
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5" /> Players ({players.length})
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${playersOpen ? "rotate-180" : ""}`}
                />
              </CardTitle>
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  openCreatePlayer();
                }}
                size="sm"
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Add Player
              </Button>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Each player has one handicap used across every team they're in. Edit here to update everywhere.
              </p>
              <Input
                placeholder="Search player by name..."
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                className="mb-3 max-w-sm"
              />
              {playersLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                </div>
              ) : filteredPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {playerSearch ? "No players match." : "No players yet."}
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredPlayers.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-md border p-3 bg-card"
                    >
                      <div>
                        <p className="font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          HCP <span className="font-semibold text-foreground">{p.handicap.toFixed(1)}</span>
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditPlayer(p)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(`Remove player "${p.name}"?`)) deletePlayerMutation.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Player edit dialog */}
      <Dialog open={playerDialogOpen} onOpenChange={setPlayerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlayer ? "Edit Player" : "Add Player"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              savePlayerMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label>Player Name</Label>
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="e.g. John Smith"
                disabled={!!editingPlayer}
              />
              {editingPlayer && (
                <p className="text-xs text-muted-foreground mt-1">
                  Names are locked. Delete and re-add to change.
                </p>
              )}
            </div>
            <div>
              <Label>Handicap</Label>
              <Input
                type="number"
                step="0.1"
                value={playerHcp}
                onChange={(e) => setPlayerHcp(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closePlayerDialog}>
                Cancel
              </Button>
              <Button type="submit" disabled={savePlayerMutation.isPending}>
                {savePlayerMutation.isPending ? "Saving..." : editingPlayer ? "Update" : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Team dialog, mirrors customer-facing CompRegisterTeam flow */}
      <Dialog open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addTeamMutation.mutate();
            }}
            className="space-y-4"
          >
            <div>
              <Label>Player 1 Full Name</Label>
              <Input
                value={newPlayer1}
                onChange={(e) => setNewPlayer1(e.target.value)}
                placeholder="e.g. John Smith"
                maxLength={100}
                required
              />
            </div>
            <div>
              <Label>Player 2 Full Name</Label>
              <Input
                value={newPlayer2}
                onChange={(e) => setNewPlayer2(e.target.value)}
                placeholder="e.g. Jane Doe"
                maxLength={100}
                required
              />
            </div>
            <div>
              <Label>Team Name</Label>
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g. The Eagles"
                maxLength={100}
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Handicaps default to 0, set them in the Players section after adding.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTeamDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addTeamMutation.isPending}>
                {addTeamMutation.isPending ? "Adding..." : "Add Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
