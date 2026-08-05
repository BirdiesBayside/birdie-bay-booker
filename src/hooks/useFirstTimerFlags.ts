import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FirstTimerFlag {
  team_id: string;
  is_first_timer: boolean;
  net_vs_par: number | null;
  flagged: boolean;
}

/**
 * Debut-round flags for a local (Ambrose) competition.
 * A team is a "first timer" the first time that exact pairing posts a score.
 * Their round is flagged when their net finishes 10+ strokes better than par.
 */
export function useFirstTimerFlags(competitionId?: string) {
  const { data } = useQuery({
    queryKey: ["local-comp-first-timer-flags", competitionId],
    enabled: !!competitionId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("local_comp_first_timer_flags", {
        p_competition_id: competitionId,
      });
      if (error) throw error;
      return (data || []) as FirstTimerFlag[];
    },
  });

  const map = new Map<string, FirstTimerFlag>();
  (data || []).forEach((f) => map.set(f.team_id, f));
  return map;
}
