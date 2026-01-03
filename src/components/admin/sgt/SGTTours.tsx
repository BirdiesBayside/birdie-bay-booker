import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  Search, 
  Trophy, 
  Users, 
  Calendar, 
  ChevronRight,
  Info,
  CheckCircle2,
  Plus,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { TourFormDialog } from "./TourFormDialog";

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

export function SGTTours() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTour, setSelectedTour] = useState<Tour | null>(null);
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [tourFormOpen, setTourFormOpen] = useState(false);
  const [editingTour, setEditingTour] = useState<Tour | null>(null);

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

  const filteredTours = tours?.filter((tour) =>
    tour.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewStandings = (tour: Tour) => {
    setSelectedTour(tour);
    setStandingsOpen(true);
  };

  const handleOpenInfo = (tour: Tour) => {
    setSelectedTour(tour);
    setInfoOpen(true);
  };

  const handleCreateTour = () => {
    setEditingTour(null);
    setTourFormOpen(true);
  };

  const handleEditTour = (tour: Tour) => {
    setEditingTour(tour);
    setTourFormOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Search and Create */}
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
        <Button onClick={handleCreateTour} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Tour
        </Button>
      </div>

      {/* Tours Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredTours && filteredTours.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTours.map((tour) => (
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
                  <Badge variant={tour.active === 1 ? "default" : "secondary"}>
                    {tour.active === 1 ? "Active" : "Inactive"}
                  </Badge>
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
                    onClick={() => handleEditTour(tour)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenInfo(tour)}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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

      {/* Info Dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedTour?.name} - Info</DialogTitle>
            <DialogDescription>
              Tour information and registration status
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-medium mb-2">
                <CheckCircle2 className="h-4 w-4" />
                Auto-Registration Active
              </div>
              <p className="text-sm text-muted-foreground">
                All members are automatically registered to all active tours and tournaments. 
                New members are registered immediately when they join.
              </p>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tour Members</span>
                <span className="font-medium">{memberCounts?.[selectedTour?.tour_id ?? 0] || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Active Members</span>
                <span className="font-medium">{totalMembers}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tournaments</span>
                <span className="font-medium">{tournamentCounts?.[selectedTour?.tour_id ?? 0] || 0}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tour Form Dialog (Create/Edit) */}
      <TourFormDialog
        open={tourFormOpen}
        onOpenChange={setTourFormOpen}
        tour={editingTour}
      />
    </div>
  );
}
