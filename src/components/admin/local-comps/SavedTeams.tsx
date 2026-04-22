import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Users } from "lucide-react";

interface SavedTeam {
  id: string;
  team_name: string;
  player1_name: string;
  player1_handicap: number;
  player1_local_hcp: number;
  player2_name: string;
  player2_handicap: number;
  player2_local_hcp: number;
  is_active: boolean;
}

interface TeamForm {
  team_name: string;
  player1_name: string;
  player1_handicap: string;
  player2_name: string;
  player2_handicap: string;
}

const emptyForm: TeamForm = {
  team_name: "",
  player1_name: "",
  player1_handicap: "0",
  player2_name: "",
  player2_handicap: "0",
};

export function SavedTeams() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<SavedTeam | null>(null);
  const [form, setForm] = useState<TeamForm>(emptyForm);
  const [search, setSearch] = useState("");

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["local-comp-saved-teams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_comp_saved_teams")
        .select("*")
        .order("team_name", { ascending: true });
      if (error) throw error;
      return data as SavedTeam[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: TeamForm) => {
      const payload = {
        team_name: values.team_name.trim(),
        player1_name: values.player1_name.trim(),
        player1_handicap: parseFloat(values.player1_handicap) || 0,
        player2_name: values.player2_name.trim(),
        player2_handicap: parseFloat(values.player2_handicap) || 0,
      };

      if (editingTeam) {
        const { error } = await supabase
          .from("local_comp_saved_teams")
          .update(payload)
          .eq("id", editingTeam.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("local_comp_saved_teams")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-saved-teams"] });
      toast.success(editingTeam ? "Team updated" : "Team added");
      closeDialog();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("local_comp_saved_teams")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-saved-teams"] });
      toast.success("Team deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openCreate() {
    setEditingTeam(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(team: SavedTeam) {
    setEditingTeam(team);
    setForm({
      team_name: team.team_name,
      player1_name: team.player1_name,
      player1_handicap: String(team.player1_handicap),
      player2_name: team.player2_name,
      player2_handicap: String(team.player2_handicap),
    });
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingTeam(null);
    setForm(emptyForm);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.team_name.trim() || !form.player1_name.trim() || !form.player2_name.trim()) {
      toast.error("Team name and both player names are required");
      return;
    }
    saveMutation.mutate(form);
  }

  const filtered = teams.filter(
    (t) =>
      t.team_name.toLowerCase().includes(search.toLowerCase()) ||
      t.player1_name.toLowerCase().includes(search.toLowerCase()) ||
      t.player2_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-display font-bold text-foreground">Saved Teams</h2>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> Add Team
        </Button>
      </div>

      <Input
        placeholder="Search teams or players..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mb-3 opacity-40" />
            <p>{search ? "No matching teams found" : "No saved teams yet. Add your first one!"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => (
            <Card key={team.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{team.team_name}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(team)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Delete team "${team.team_name}"?`)) {
                          deleteMutation.mutate(team.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>{team.player1_name} — HCP {team.player1_handicap}</p>
                  <p>{team.player2_name} — HCP {team.player2_handicap}</p>
                  <p className="text-xs font-medium">
                    Combined: {((team.player1_handicap + team.player2_handicap) / 4).toFixed(1)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam ? "Edit Team" : "Add Team"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Team Name</Label>
              <Input
                value={form.team_name}
                onChange={(e) => setForm({ ...form, team_name: e.target.value })}
                placeholder="e.g. The Eagles"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Player 1 Name</Label>
                <Input
                  value={form.player1_name}
                  onChange={(e) => setForm({ ...form, player1_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Player 1 HCP</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.player1_handicap}
                  onChange={(e) => setForm({ ...form, player1_handicap: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Player 2 Name</Label>
                <Input
                  value={form.player2_name}
                  onChange={(e) => setForm({ ...form, player2_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Player 2 HCP</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={form.player2_handicap}
                  onChange={(e) => setForm({ ...form, player2_handicap: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving..." : editingTeam ? "Update" : "Add Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
