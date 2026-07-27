import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Loader2, Search } from "lucide-react";
import { ScorecardDisplay } from "@/components/league/ScorecardDisplay";
import type { Scorecard } from "@/lib/sgt-api";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: {
    tournament_id: number;
    name: string;
  } | null;
}

function formatToPar(toPar: number | null): string {
  if (toPar === null || toPar === undefined) return "-";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

export function TournamentScorecardsDialog({ open, onOpenChange, tournament }: Props) {
  const [search, setSearch] = useState("");

  const { data: scorecards, isLoading } = useQuery({
    queryKey: ["sgt-tournament-scorecards", tournament?.tournament_id],
    enabled: open && !!tournament?.tournament_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sgt_scorecards")
        .select("*")
        .eq("tournament_id", tournament!.tournament_id)
        .order("total_net", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const filtered = scorecards?.filter((s) =>
    s.player_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Scorecards</DialogTitle>
          <DialogDescription>
            {tournament?.name} — every player's hole-by-hole card.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search player..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading scorecards…
          </div>
        ) : filtered && filtered.length > 0 ? (
          <Accordion type="multiple" className="w-full">
            {filtered.map((s) => (
              <AccordionItem key={s.id} value={s.id}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex flex-1 items-center justify-between gap-3 pr-3 text-left">
                    <div>
                      <p className="font-medium">{s.player_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Round {s.round ?? "-"} · {s.course_name || "-"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline">Gross {s.total_gross ?? "-"}</Badge>
                      <Badge variant="secondary">
                        Net {s.total_net ?? "-"} ({formatToPar(s.to_par_net)})
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ScorecardDisplay
                    showDetails
                    scorecard={{
                      player_id: s.player_id,
                      player_name: s.player_name,
                      course_name: s.course_name,
                      round: s.round,
                      teetype: s.teetype,
                      rating: s.rating,
                      slope: s.slope,
                      hcp_index: s.hcp_index,
                      out_gross: s.out_gross,
                      in_gross: s.in_gross,
                      total_gross: s.total_gross,
                      out_net: s.out_net,
                      in_net: s.in_net,
                      total_net: s.total_net,
                      toPar_gross: s.to_par_gross,
                      toPar_net: s.to_par_net,
                      holeData: (s.hole_data ?? {}) as Record<string, number>,
                    } as unknown as Scorecard}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <p className="py-12 text-center text-muted-foreground">
            No scorecards found for this tournament.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
