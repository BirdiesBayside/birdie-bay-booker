import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Tour {
  tour_id: number;
  name: string;
  active: number;
  start_date: string | null;
  end_date: string | null;
}

interface Tournament {
  tournament_id: number;
  tour_id: number;
  name: string;
  course_name: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface ActiveTourData {
  activeTour: Tour | null;
  currentTournament: Tournament | null;
  tours: Tour[];
  tournaments: Tournament[];
  isLoading: boolean;
  error: string | null;
}

export function useActiveTourData(): ActiveTourData {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [tours, setTours] = useState<Tour[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch all tours, sorted by active first, then by start date
        const { data: toursData, error: toursError } = await supabase
          .from("sgt_tours")
          .select("*")
          .order("active", { ascending: false })
          .order("start_date", { ascending: false });

        if (toursError) throw toursError;

        setTours(toursData || []);

        // Find the active tour (active = 1)
        const active = toursData?.find((t) => t.active === 1) || toursData?.[0] || null;
        setActiveTour(active);

        if (active) {
          // Fetch tournaments for the active tour
          const { data: tournamentsData, error: tournamentsError } = await supabase
            .from("sgt_tournaments")
            .select("*")
            .eq("tour_id", active.tour_id)
            .order("start_date", { ascending: false });

          if (tournamentsError) throw tournamentsError;

          // Filter to show only tournaments that have started or are in progress/completed
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const availableTournaments = (tournamentsData || []).filter((t) => {
            if (t.status === "Completed" || t.status === "In Progress" || t.status === "Active") return true;
            if (!t.start_date) return false;
            const startDate = new Date(t.start_date + "T00:00:00");
            return startDate <= today;
          });

          setTournaments(availableTournaments);

          // Current tournament is the most recent one (first in the sorted list)
          setCurrentTournament(availableTournaments[0] || null);
        }
      } catch (err) {
        console.error("[useActiveTourData] Error:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch tour data");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  return {
    activeTour,
    currentTournament,
    tours,
    tournaments,
    isLoading,
    error,
  };
}
