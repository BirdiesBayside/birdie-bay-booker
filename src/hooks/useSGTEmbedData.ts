import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TourStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  events: number;
  wins: number;
  top5: number;
  top10: number;
  points: number;
}

export interface TournamentStanding {
  position: number;
  playerName: string;
  hcp: number | null;
  r1: string;
  r1Thru: string;
  r2: string;
  r2Thru: string;
  total: string;
  toPar: string;
}

interface UseSGTEmbedDataOptions {
  type: "tour" | "tournament";
  id: number | null;
  scoreType: "gross" | "net";
  enabled?: boolean;
  refreshInterval?: number; // in ms, default 30000 (30s)
}

interface SGTEmbedResponse<T> {
  standings: T[];
  fetchedAt: string;
  source: string;
}

export function useSGTTourStandings(options: Omit<UseSGTEmbedDataOptions, "type">) {
  return useSGTEmbedData<TourStanding>({ ...options, type: "tour" });
}

export function useSGTTournamentStandings(options: Omit<UseSGTEmbedDataOptions, "type">) {
  return useSGTEmbedData<TournamentStanding>({ ...options, type: "tournament" });
}

function useSGTEmbedData<T>({
  type,
  id,
  scoreType,
  enabled = true,
  refreshInterval = 30000,
}: UseSGTEmbedDataOptions) {
  const [standings, setStandings] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!id || !enabled) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fnError } = await supabase.functions.invoke<SGTEmbedResponse<T>>(
        "sgt-embed-scrape",
        {
          body: { type, id: id.toString(), scoreType },
        }
      );

      if (fnError) {
        console.error("[useSGTEmbedData] Function error:", fnError);
        setError(fnError.message);
        return;
      }

      if (data?.standings) {
        setStandings(data.standings);
        setLastUpdated(new Date(data.fetchedAt));
        setError(null);
      }
    } catch (err) {
      console.error("[useSGTEmbedData] Error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setIsLoading(false);
    }
  }, [type, id, scoreType, enabled]);

  // Initial fetch
  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  // Auto-refresh
  useEffect(() => {
    if (!enabled || !id || refreshInterval <= 0) return;

    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchData, enabled, id, refreshInterval]);

  return {
    standings,
    isLoading,
    error,
    lastUpdated,
    refetch: fetchData,
  };
}

export default useSGTEmbedData;
