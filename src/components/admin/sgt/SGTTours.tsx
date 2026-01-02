import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Search, 
  Trophy, 
  Users, 
  Calendar, 
  ChevronRight,
  Settings,
  UserPlus,
  Loader2,
  CheckCircle2
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface TourStanding {
  id: string;
  position: number;
  user_name: string;
  points: number | null;
  events: number | null;
  first: number | null;
  top5: number | null;
  top10: number | null;
  hcp: number | null;
}

interface Tour {
  id: string;
  tour_id: number;
  name: string;
  active: number;
  start_date: string | null;
  end_date: string | null;
  team_tour: number | null;
}

interface TourSettings {
  id: string;
  tour_id: number;
  auto_register_members: boolean;
  auto_register_tournaments: boolean;
  use_combo_handicap: boolean;
}

export function SGTTours() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmRegisterAll, setConfirmRegisterAll] = useState(false);

  // Fetch tours
  const { data: tours, isLoading } = useQuery({
    queryKey: ["sgt-tours"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("*")
        .order("active", { ascending: false })
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as Tour[];
    },
  });

  // Fetch tour settings
  const { data: allTourSettings } = useQuery({
    queryKey: ["sgt-tour-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tour_settings")
        .select("*");
      if (error) throw error;
      return data as TourSettings[];
    },
  });

  // Fetch standings for selected tour
  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["sgt-tour-standings", selectedTour?.tour_id],
    queryFn: async () => {
      if (!selectedTour) return [];
      const { data, error } = await supabase
        .from("sgt_tour_standings")
        .select("*")
        .eq("tour_id", selectedTour.tour_id)
        .eq("gross_or_net", "gross")
        .order("position", { ascending: true });
      if (error) throw error;
      return data as TourStanding[];
    },
    enabled: !!selectedTour,
  });

  // Fetch tour member counts
  const { data: memberCounts } = useQuery({
    queryKey: ["sgt-tour-member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tour_members")
        .select("tour_id");
      if (error) throw error;
      
      const counts: Record<number, number> = {};
      data.forEach((member) => {
        counts[member.tour_id] = (counts[member.tour_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Fetch tournament counts per tour
  const { data: tournamentCounts } = useQuery({
    queryKey: ["sgt-tour-tournament-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("tour_id");
      if (error) throw error;
      
      const counts: Record<number, number> = {};
      data.forEach((tournament) => {
        counts[tournament.tour_id] = (counts[tournament.tour_id] || 0) + 1;
      });
      return counts;
    },
  });

  // Fetch total member count
  const { data: totalMembers } = useQuery({
    queryKey: ["sgt-members-total"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sgt_members")
        .select("*", { count: "exact", head: true })
        .eq("user_active", 1);
      if (error) throw error;
      return count || 0;
    },
  });

  // Save tour settings mutation
  const saveSettings = useMutation({
    mutationFn: async (settings: Partial<TourSettings> & { tour_id: number }) => {
      const { data, error } = await supabase
        .from("sgt_tour_settings")
        .upsert({
          tour_id: settings.tour_id,
          auto_register_members: settings.auto_register_members ?? false,
          auto_register_tournaments: settings.auto_register_tournaments ?? false,
          use_combo_handicap: settings.use_combo_handicap ?? true,
        }, { onConflict: "tour_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-tour-settings"] });
      toast({
        title: "Settings saved",
        description: "Tour settings have been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive",
      });
    },
  });

  // Register all members to tour mutation
  const registerAllMembers = useMutation({
    mutationFn: async ({ tourId, useComboHandicap }: { tourId: number; useComboHandicap: boolean }) => {
      const { data, error } = await supabase.functions.invoke("sgt-member-management", {
        body: { 
          action: "register-all-to-tour",
          tourId,
          useComboHandicap,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["sgt-tour-member-counts"] });
      toast({
        title: "Registration complete",
        description: `Successfully registered ${data.successCount || 0} members to the tour`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to register members",
        variant: "destructive",
      });
    },
  });

  const filteredTours = tours?.filter((tour) =>
    tour.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSettings = (tourId: number): TourSettings | undefined => {
    return allTourSettings?.find((s) => s.tour_id === tourId);
  };

  const handleViewStandings = (tour: Tour) => {
    setSelectedTour(tour);
    setStandingsOpen(true);
  };

  const handleOpenSettings = (tour: Tour) => {
    setSelectedTour(tour);
    setSettingsOpen(true);
  };

  const handleSettingsChange = (field: keyof TourSettings, value: boolean) => {
    if (!selectedTour) return;
    
    const currentSettings = getSettings(selectedTour.tour_id);
    saveSettings.mutate({
      tour_id: selectedTour.tour_id,
      auto_register_members: field === "auto_register_members" ? value : currentSettings?.auto_register_members ?? false,
      auto_register_tournaments: field === "auto_register_tournaments" ? value : currentSettings?.auto_register_tournaments ?? false,
      use_combo_handicap: field === "use_combo_handicap" ? value : currentSettings?.use_combo_handicap ?? true,
    });
  };

  const handleRegisterAllMembers = () => {
    if (!selectedTour) return;
    const settings = getSettings(selectedTour.tour_id);
    registerAllMembers.mutate({
      tourId: selectedTour.tour_id,
      useComboHandicap: settings?.use_combo_handicap ?? true,
    });
    setConfirmRegisterAll(false);
  };

  const currentSettings = selectedTour ? getSettings(selectedTour.tour_id) : undefined;

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tours..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Tours Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredTours && filteredTours.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTours.map((tour) => {
            const settings = getSettings(tour.tour_id);
            const hasAutoReg = settings?.auto_register_members || settings?.auto_register_tournaments;
            
            return (
              <Card key={tour.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <Trophy className="h-4 w-4 text-amber-500" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold line-clamp-1">
                          {tour.name}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                          ID: {tour.tour_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasAutoReg && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                          Auto-Reg
                        </Badge>
                      )}
                      <Badge variant={tour.active === 1 ? "default" : "secondary"}>
                        {tour.active === 1 ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{memberCounts?.[tour.tour_id] || 0} members</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{tournamentCounts?.[tour.tour_id] || 0} events</span>
                    </div>
                  </div>
                  
                  {tour.start_date && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(tour.start_date), "MMM d, yyyy")}
                      {tour.end_date && ` - ${format(new Date(tour.end_date), "MMM d, yyyy")}`}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-2"
                      onClick={() => handleViewStandings(tour)}
                    >
                      Standings
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenSettings(tour)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No tours found</p>
          </CardContent>
        </Card>
      )}

      {/* Standings Dialog */}
      <Dialog open={standingsOpen} onOpenChange={setStandingsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTour?.name} - Standings</DialogTitle>
          </DialogHeader>
          
          {standingsLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : standings && standings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Pos</TableHead>
                  <TableHead>Player</TableHead>
                  <TableHead className="text-right">Points</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Wins</TableHead>
                  <TableHead className="text-right">Top 5</TableHead>
                  <TableHead className="text-right">HCP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {standings.map((standing) => (
                  <TableRow key={standing.id}>
                    <TableCell className="font-medium">
                      {standing.position === 1 ? "🥇" : standing.position === 2 ? "🥈" : standing.position === 3 ? "🥉" : standing.position}
                    </TableCell>
                    <TableCell className="font-medium">{standing.user_name}</TableCell>
                    <TableCell className="text-right">{standing.points ?? 0}</TableCell>
                    <TableCell className="text-right">{standing.events ?? 0}</TableCell>
                    <TableCell className="text-right">{standing.first ?? 0}</TableCell>
                    <TableCell className="text-right">{standing.top5 ?? 0}</TableCell>
                    <TableCell className="text-right">
                      {standing.hcp != null ? standing.hcp.toFixed(1) : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center py-12 text-muted-foreground">No standings data available</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTour?.name} - Settings</DialogTitle>
            <DialogDescription>
              Configure auto-registration and handicap settings for this tour
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Auto-register members toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-register-members" className="text-base">
                  Auto-register new members
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically add all new SGT members to this tour
                </p>
              </div>
              <Switch
                id="auto-register-members"
                checked={currentSettings?.auto_register_members ?? false}
                onCheckedChange={(checked) => handleSettingsChange("auto_register_members", checked)}
                disabled={saveSettings.isPending}
              />
            </div>

            {/* Auto-register tournaments toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-register-tournaments" className="text-base">
                  Auto-register to tournaments
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically register tour members to new tournaments
                </p>
              </div>
              <Switch
                id="auto-register-tournaments"
                checked={currentSettings?.auto_register_tournaments ?? false}
                onCheckedChange={(checked) => handleSettingsChange("auto_register_tournaments", checked)}
                disabled={saveSettings.isPending}
              />
            </div>

            {/* Use combo handicap toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="use-combo-handicap" className="text-base">
                  Use combo handicap
                </Label>
                <p className="text-sm text-muted-foreground">
                  Use combined handicap (useComboCapstring) for registrations
                </p>
              </div>
              <Switch
                id="use-combo-handicap"
                checked={currentSettings?.use_combo_handicap ?? true}
                onCheckedChange={(checked) => handleSettingsChange("use_combo_handicap", checked)}
                disabled={saveSettings.isPending}
              />
            </div>

            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <p className="font-medium">Register all members now</p>
                  <p className="text-sm text-muted-foreground">
                    Add all {totalMembers} active members to this tour
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setConfirmRegisterAll(true)}
                  disabled={registerAllMembers.isPending}
                  className="gap-2"
                >
                  {registerAllMembers.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  Register All
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Register All Dialog */}
      <AlertDialog open={confirmRegisterAll} onOpenChange={setConfirmRegisterAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Register All Members</AlertDialogTitle>
            <AlertDialogDescription>
              This will register all {totalMembers} active SGT members to "{selectedTour?.name}".
              {currentSettings?.use_combo_handicap && " Combo handicap will be used."}
              <br /><br />
              Members already registered will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegisterAllMembers}>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Register All Members
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
