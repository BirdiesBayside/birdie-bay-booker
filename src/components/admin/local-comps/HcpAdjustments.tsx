import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingDown, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface Adjustment {
  id: string;
  player_name: string;
  competition_name: string | null;
  position: number | null;
  delta: number;
  reason: string;
  hcp_before: number | null;
  hcp_after: number | null;
  created_at: string;
}

export function HcpAdjustments() {
  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: ["local-hcp-adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("local_hcp_adjustments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as Adjustment[];
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-display font-bold text-foreground">Handicap Adjustments</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Auto-applied when a competition is marked completed. Winning team: −2 strokes each (or −4 if they won the previous comp too).
          Last team: +2 strokes each. Changes sync across every saved team containing that player (case-insensitive name match).
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : adjustments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <History className="h-12 w-12 mb-3 opacity-40" />
            <p>No adjustments yet. Mark a competition as completed to trigger the Winner's Tax.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {adjustments.map((adj) => {
            const isPenalty = adj.delta < 0;
            return (
              <Card key={adj.id}>
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${isPenalty ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                      {isPenalty ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{adj.player_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {adj.competition_name || "—"} · {adj.reason}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <Badge variant={isPenalty ? "destructive" : "default"} className="font-mono">
                        {adj.delta > 0 ? "+" : ""}{adj.delta.toFixed(1)}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {adj.hcp_before?.toFixed(1) ?? "?"} → <span className="font-semibold text-foreground">{adj.hcp_after?.toFixed(1) ?? "?"}</span>
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground hidden sm:block w-24 text-right">
                      {format(new Date(adj.created_at), "dd MMM HH:mm")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
