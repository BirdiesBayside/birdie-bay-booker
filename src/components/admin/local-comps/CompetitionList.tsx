import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Calendar, DollarSign, Trophy, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format } from "date-fns";

export function CompetitionList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [entryFee, setEntryFee] = useState("10");

  const { data: competitions, isLoading } = useQuery({
    queryKey: ["local-competitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_competitions")
        .select("*")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("local_competitions").insert({
        name,
        date,
        entry_fee: parseFloat(entryFee),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      toast({ title: "Competition created", duration: 3000 });
      setDialogOpen(false);
      setName("");
      setDate("");
      setEntryFee("10");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("local_competitions")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      toast({ title: "Status updated", duration: 3000 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Delete teams first (FK constraint)
      await supabase.from("local_comp_teams").delete().eq("competition_id", id);
      const { error } = await supabase.from("local_competitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      toast({ title: "Competition deleted", duration: 3000 });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case "upcoming": return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "active": return "bg-green-500/10 text-green-500 border-green-500/20";
      case "completed": return "bg-muted text-muted-foreground border-muted";
      default: return "";
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Competitions</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> New Competition</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Competition</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wednesday Night Ambrose" />
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>Entry Fee ($)</Label>
                <Input type="number" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} min="0" step="5" />
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={!name || !date || createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Competition"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {(!competitions || competitions.length === 0) ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Trophy className="h-12 w-12 mb-3 opacity-40" />
            <p>No competitions yet. Create your first one!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {competitions.map((comp) => (
            <Card key={comp.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{comp.name}</CardTitle>
                  <Badge variant="outline" className={statusColor(comp.status)}>
                    {comp.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6 text-sm text-muted-foreground mb-4">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    {format(new Date(comp.date + "T00:00:00"), "EEE dd MMM yyyy")}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    ${comp.entry_fee} entry
                  </span>
                  <span>Format: 2-Man Ambrose</span>
                </div>
                <div className="flex gap-2">
                  {comp.status === "upcoming" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: comp.id, status: "active" })}>
                      Start Competition
                    </Button>
                  )}
                  {comp.status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: comp.id, status: "completed" })}>
                      Mark Completed
                    </Button>
                  )}
                  {comp.status === "completed" && (
                    <Button size="sm" variant="ghost" onClick={() => updateStatusMutation.mutate({ id: comp.id, status: "active" })}>
                      Reopen
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
