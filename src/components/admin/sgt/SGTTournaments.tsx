import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Calendar } from "lucide-react";
import { format } from "date-fns";

export function SGTTournaments() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tourFilter, setTourFilter] = useState("all");

  // Fetch tournaments
  const { data: tournaments, isLoading } = useQuery({
    queryKey: ["sgt-tournaments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch tours for filter
  const { data: tours } = useQuery({
    queryKey: ["sgt-tours-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filteredTournaments = tournaments?.filter((tournament) => {
    const matchesSearch =
      tournament.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (tournament.course_name?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const matchesStatus =
      statusFilter === "all" || tournament.status === statusFilter;
    
    const matchesTour =
      tourFilter === "all" || tournament.tour_id.toString() === tourFilter;

    return matchesSearch && matchesStatus && matchesTour;
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "Completed":
        return <Badge variant="default" className="bg-green-600">Completed</Badge>;
      case "Active":
        return <Badge variant="default" className="bg-blue-600">Active</Badge>;
      case "Upcoming":
        return <Badge variant="secondary">Upcoming</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tournaments or courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Upcoming">Upcoming</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tourFilter} onValueChange={setTourFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Tour" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tours</SelectItem>
            {tours?.map((tour) => (
              <SelectItem key={tour.tour_id} value={tour.tour_id.toString()}>
                {tour.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tournaments Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredTournaments && filteredTournaments.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tournament</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTournaments.map((tournament) => (
                  <TableRow key={tournament.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{tournament.name}</p>
                        <p className="text-xs text-muted-foreground">
                          ID: {tournament.tournament_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {tournament.course_name || "-"}
                    </TableCell>
                    <TableCell>
                      {tournament.start_date
                        ? format(new Date(tournament.start_date), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {tournament.end_date
                        ? format(new Date(tournament.end_date), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(tournament.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No tournaments found</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
