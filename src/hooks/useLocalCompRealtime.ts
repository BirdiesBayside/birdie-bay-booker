import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Subscribes to all local-comp tables and invalidates every related query
 * whenever ANY change happens. Ensures players, saved teams, comp teams,
 * adjustments and competition list all stay in sync without manual refresh.
 */
export function useLocalCompRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const invalidateAll = () => {
      queryClient.invalidateQueries({ queryKey: ["local-comp-players"] });
      queryClient.invalidateQueries({ queryKey: ["local-comp-saved-teams"] });
      queryClient.invalidateQueries({ queryKey: ["saved-local-comp-teams"] });
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams"] });
      queryClient.invalidateQueries({ queryKey: ["local-comp-teams-results"] });
      queryClient.invalidateQueries({ queryKey: ["local-competitions"] });
      queryClient.invalidateQueries({ queryKey: ["local-competitions-all"] });
      queryClient.invalidateQueries({ queryKey: ["local-hcp-adjustments"] });
    };

    const channel = supabase
      .channel("local-comp-global-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "local_comp_players" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "local_comp_saved_teams" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "local_comp_teams" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "local_competitions" }, invalidateAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "local_hcp_adjustments" }, invalidateAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
