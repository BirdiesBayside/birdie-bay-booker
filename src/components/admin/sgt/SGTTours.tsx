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
} from "@/components/ui/dialog";
import { Search, Trophy, Users, Calendar, ChevronRight } from "lucide-react";
import { format } from "date-fns";

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

export function SGTTours() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTour, setSelectedTour] = useState<number | null>(null);
  const [standingsOpen, setStandingsOpen] = useState(false);

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
      return data;
    },
  });

  // Fetch standings for selected tour
  const { data: standings, isLoading: standingsLoading } = useQuery({
    queryKey: ["sgt-tour-standings", selectedTour],
    queryFn: async () => {
      if (!selectedTour) return [];
      const { data, error } = await supabase
        .from("sgt_tour_standings")
        .select("*")
        .eq("tour_id", selectedTour)
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

  const filteredTours = tours?.filter((tour) =>
    tour.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleViewStandings = (tourId: number) => {
    setSelectedTour(tourId);
    setStandingsOpen(true);
  };

  const selectedTourName = tours?.find((t) => t.tour_id === selectedTour)?.name;

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

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => handleViewStandings(tour.tour_id)}
                >
                  View Standings
                  <ChevronRight className="h-4 w-4" />
                </Button>
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
            <DialogTitle>{selectedTourName} - Standings</DialogTitle>
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
    </div>
  );
}
