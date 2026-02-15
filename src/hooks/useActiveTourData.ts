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
  previousTournament: Tournament | null;
  tours: Tour[];
  tournaments: Tournament[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Get today's date in Brisbane timezone (AEST UTC+10).
 * Tournaments start on Sunday and end on Monday to account for timezone overlap,
 * so "current week" = tournament whose end_date >= today (earliest such one).
 * "Previous week" = the tournament right before the current one.
 */
function getBrisbaneToday(): string {
  const now = new Date();
  // Format in Brisbane timezone
  const brisbane = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // returns YYYY-MM-DD
  return brisbane;
}

export function useActiveTourData(): ActiveTourData {
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [previousTournament, setPreviousTournament] = useState<Tournament | null>(null);
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

          const today = getBrisbaneToday();

          // Filter to show only tournaments that have started (start_date <= today)
          // or have a relevant status
          const availableTournaments = (tournamentsData || []).filter((t) => {
            if (t.status === "Completed" || t.status === "In Progress" || t.status === "Active") return true;
            if (!t.start_date) return false;
            return t.start_date <= today;
          });

          setTournaments(availableTournaments);

          // Current tournament: the one whose end_date >= today with the earliest end_date.
          // This correctly handles the Sunday overlap where a new tournament starts 
          // on Sunday but the previous week's tournament ends on Monday.
          const activeTournaments = availableTournaments
            .filter((t) => t.end_date && t.end_date >= today)
            .sort((a, b) => (a.end_date || "").localeCompare(b.end_date || ""));

          const current = activeTournaments[0] || availableTournaments[0] || null;
          setCurrentTournament(current);

          // Previous tournament: the one right before the current one in chronological order
          if (current) {
            const previous = availableTournaments.find(
              (t) => t.tournament_id !== current.tournament_id && 
                     (t.start_date || "") < (current.start_date || "")
            );
            setPreviousTournament(previous || null);
          } else {
            setPreviousTournament(null);
          }
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
    previousTournament,
    tours,
    tournaments,
    isLoading,
    error,
  };
}
