import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Trophy, Award, Calendar, DollarSign, Mail, CheckCircle2, Plus, TrendingUp, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface WeeklyPrize {
  id: string;
  tournament_id: number;
  player_id: number;
  player_name: string;
  profile_user_id: string | null;
  prize_amount: number;
  awarded_at: string;
  email_sent: boolean;
}

interface MonthlyAward {
  id: string;
  tour_id: number;
  month: string;
  winner_player_name: string;
  winner_player_id: number | null;
  prize_description: string | null;
  awarded_at: string;
  notes: string | null;
}

interface MonthlyStanding {
  id: string;
  tour_id: number;
  month: string;
  player_id: number;
  player_name: string;
  total_net_score: number | null;
  total_gross_score: number | null;
  tournaments_played: number;
  best_net: number | null;
  best_gross: number | null;
  net_position: number | null;
  gross_position: number | null;
}

interface Tournament {
  tournament_id: number;
  name: string;
  status: string | null;
  start_date: string | null;
}

export function SGTWinners() {
  const queryClient = useQueryClient();
  const [showAddMonthlyDialog, setShowAddMonthlyDialog] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [standingsType, setStandingsType] = useState<"net" | "gross">("net");
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [newMonthlyAward, setNewMonthlyAward] = useState({
    month: "",
    winner_player_name: "",
    prize_description: "",
    notes: "",
  });

  // Fetch weekly prizes
  const { data: weeklyPrizes, isLoading: loadingWeekly } = useQuery({
    queryKey: ["sgt-weekly-prizes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_weekly_prizes")
        .select("*")
        .order("awarded_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as WeeklyPrize[];
    },
  });

  // Fetch monthly awards
  const { data: monthlyAwards, isLoading: loadingMonthly } = useQuery({
    queryKey: ["sgt-monthly-awards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_monthly_awards")
        .select("*")
        .order("awarded_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data as MonthlyAward[];
    },
  });

  // Fetch monthly standings
  const { data: monthlyStandings, isLoading: loadingStandings } = useQuery({
    queryKey: ["sgt-monthly-standings", selectedMonth],
    queryFn: async () => {
      let query = supabase
        .from("sgt_monthly_standings")
        .select("*")
        .order("net_position", { ascending: true });
      
      if (selectedMonth) {
        query = query.eq("month", selectedMonth);
      }
      
      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      return data as MonthlyStanding[];
    },
  });

  // Get unique months from standings for the filter
  const { data: availableMonths } = useQuery({
    queryKey: ["sgt-monthly-standings-months"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_monthly_standings")
        .select("month")
        .order("month", { ascending: false });
      
      if (error) throw error;
      
      // Get unique months
      const uniqueMonths = [...new Set(data?.map(d => d.month) || [])];
      return uniqueMonths;
    },
  });

  // Fetch tournaments for reference
  const { data: tournaments } = useQuery({
    queryKey: ["sgt-tournaments-for-prizes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tournaments")
        .select("tournament_id, name, status, start_date")
        .order("start_date", { ascending: false })
        .limit(100);
      
      if (error) throw error;
      return data as Tournament[];
    },
  });

  // Fetch active tour
  const { data: activeTour } = useQuery({
    queryKey: ["sgt-active-tour"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_tours")
        .select("tour_id, name")
        .eq("active", 1)
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Add monthly award mutation
  const addMonthlyAward = useMutation({
    mutationFn: async (award: typeof newMonthlyAward) => {
      if (!activeTour) throw new Error("No active tour found");
      
      const { error } = await supabase.from("sgt_monthly_awards").insert({
        tour_id: activeTour.tour_id,
        month: award.month,
        winner_player_name: award.winner_player_name,
        prize_description: award.prize_description || null,
        notes: award.notes || null,
      });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgt-monthly-awards"] });
      setShowAddMonthlyDialog(false);
      setNewMonthlyAward({ month: "", winner_player_name: "", prize_description: "", notes: "" });
      toast.success("Monthly award recorded");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to add award");
    },
  });

  // Recalculate monthly standings
  const recalculateStandings = async () => {
    setIsRecalculating(true);
    try {
      const { error } = await supabase.functions.invoke("sgt-calculate-monthly-standings", {
        body: selectedMonth ? { month: selectedMonth } : {},
      });
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["sgt-monthly-standings"] });
      queryClient.invalidateQueries({ queryKey: ["sgt-monthly-standings-months"] });
      toast.success("Monthly standings recalculated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to recalculate");
    } finally {
      setIsRecalculating(false);
    }
  };

  const getTournamentName = (tournamentId: number) => {
    const tournament = tournaments?.find(t => t.tournament_id === tournamentId);
    return tournament?.name || `Tournament #${tournamentId}`;
  };

  // Generate month options for the last 12 months
  const monthOptions = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return format(date, "MMMM yyyy");
  });

  // Sort standings by selected type
  const sortedStandings = monthlyStandings?.slice().sort((a, b) => {
    if (standingsType === "net") {
      return (a.net_position ?? 999) - (b.net_position ?? 999);
    }
    return (a.gross_position ?? 999) - (b.gross_position ?? 999);
  });

  // Format score with +/- sign
  const formatScore = (score: number | null) => {
    if (score === null) return "-";
    if (score === 0) return "E";
    return score > 0 ? `+${score}` : `${score}`;
  };

  return (
    <div className="space-y-6">
      {/* Monthly Leaderboard Section - NEW */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            Monthly Leaderboard
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={selectedMonth || "all"} onValueChange={(v) => setSelectedMonth(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All months" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {(availableMonths || monthOptions).map(month => (
                  <SelectItem key={month} value={month}>{month}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={recalculateStandings}
              disabled={isRecalculating}
            >
              <RefreshCw className={`h-4 w-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={standingsType} onValueChange={(v) => setStandingsType(v as "net" | "gross")}>
            <TabsList className="mb-4">
              <TabsTrigger value="net">Net Standings</TabsTrigger>
              <TabsTrigger value="gross">Gross Standings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="net" className="mt-0">
              {loadingStandings ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !sortedStandings?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No monthly standings yet</p>
                  <p className="text-sm mt-1">Standings are calculated automatically when tournaments complete</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Pos</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Rounds</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Best</TableHead>
                      {!selectedMonth && <TableHead>Month</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStandings.map((standing, idx) => (
                      <TableRow key={standing.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {standing.net_position === 1 && (
                              <Trophy className="h-4 w-4 text-yellow-500" />
                            )}
                            {standing.net_position === 2 && (
                              <Trophy className="h-4 w-4 text-gray-400" />
                            )}
                            {standing.net_position === 3 && (
                              <Trophy className="h-4 w-4 text-amber-600" />
                            )}
                            <span className="font-medium">{standing.net_position}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{standing.player_name}</TableCell>
                        <TableCell className="text-center">{standing.tournaments_played}</TableCell>
                        <TableCell className="text-center font-mono">
                          {formatScore(standing.total_net_score)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">
                          {formatScore(standing.best_net)}
                        </TableCell>
                        {!selectedMonth && (
                          <TableCell>
                            <Badge variant="outline">{standing.month}</Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
            
            <TabsContent value="gross" className="mt-0">
              {loadingStandings ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !sortedStandings?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No monthly standings yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">Pos</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-center">Rounds</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Best</TableHead>
                      {!selectedMonth && <TableHead>Month</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedStandings.map((standing) => (
                      <TableRow key={standing.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {standing.gross_position === 1 && (
                              <Trophy className="h-4 w-4 text-yellow-500" />
                            )}
                            {standing.gross_position === 2 && (
                              <Trophy className="h-4 w-4 text-gray-400" />
                            )}
                            {standing.gross_position === 3 && (
                              <Trophy className="h-4 w-4 text-amber-600" />
                            )}
                            <span className="font-medium">{standing.gross_position}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{standing.player_name}</TableCell>
                        <TableCell className="text-center">{standing.tournaments_played}</TableCell>
                        <TableCell className="text-center font-mono">
                          {formatScore(standing.total_gross_score)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">
                          {formatScore(standing.best_gross)}
                        </TableCell>
                        {!selectedMonth && (
                          <TableCell>
                            <Badge variant="outline">{standing.month}</Badge>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Weekly Prizes Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Weekly Prizes ($40 Credit)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingWeekly ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !weeklyPrizes?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No weekly prizes awarded yet</p>
              <p className="text-sm mt-1">Prizes are automatically awarded when tournaments complete</p>
            </div>
          ) : (
            <div className="space-y-3">
              {weeklyPrizes.map(prize => (
                <div
                  key={prize.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <Trophy className="h-5 w-5 text-yellow-600" />
                    </div>
                    <div>
                      <p className="font-medium">{prize.player_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {getTournamentName(prize.tournament_id)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="gap-1">
                      <DollarSign className="h-3 w-3" />
                      {prize.prize_amount}
                    </Badge>
                    {prize.profile_user_id ? (
                      <Badge variant="outline" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Linked
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-orange-600">
                        External
                      </Badge>
                    )}
                    {prize.email_sent && (
                      <Badge variant="outline" className="gap-1">
                        <Mail className="h-3 w-3" />
                        Sent
                      </Badge>
                    )}
                    <span className="text-sm text-muted-foreground">
                      {format(new Date(prize.awarded_at), "dd MMM yyyy")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Awards Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-purple-500" />
            Monthly Awards
          </CardTitle>
          <Dialog open={showAddMonthlyDialog} onOpenChange={setShowAddMonthlyDialog}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Record Award
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Monthly Award</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={newMonthlyAward.month}
                    onValueChange={(value) => setNewMonthlyAward(prev => ({ ...prev, month: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(month => (
                        <SelectItem key={month} value={month}>{month}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Winner Name</Label>
                  <Input
                    value={newMonthlyAward.winner_player_name}
                    onChange={(e) => setNewMonthlyAward(prev => ({ ...prev, winner_player_name: e.target.value }))}
                    placeholder="Enter winner's name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Prize Description</Label>
                  <Input
                    value={newMonthlyAward.prize_description}
                    onChange={(e) => setNewMonthlyAward(prev => ({ ...prev, prize_description: e.target.value }))}
                    placeholder="e.g., $100 voucher, Golf bag, etc."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={newMonthlyAward.notes}
                    onChange={(e) => setNewMonthlyAward(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional notes..."
                    rows={2}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowAddMonthlyDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => addMonthlyAward.mutate(newMonthlyAward)}
                    disabled={!newMonthlyAward.month || !newMonthlyAward.winner_player_name || addMonthlyAward.isPending}
                  >
                    {addMonthlyAward.isPending ? "Saving..." : "Save Award"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {loadingMonthly ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !monthlyAwards?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Award className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No monthly awards recorded yet</p>
              <p className="text-sm mt-1">Click "Record Award" to add a monthly winner</p>
            </div>
          ) : (
            <div className="space-y-3">
              {monthlyAwards.map(award => (
                <div
                  key={award.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                      <Award className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-medium">{award.winner_player_name}</p>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {award.month}
                        {award.prize_description && (
                          <>
                            <span>•</span>
                            <span>{award.prize_description}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {format(new Date(award.awarded_at), "dd MMM yyyy")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
