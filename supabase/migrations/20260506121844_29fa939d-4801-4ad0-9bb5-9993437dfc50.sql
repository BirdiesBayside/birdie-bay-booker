-- Enable realtime change streams for the remaining local-comp tables so
-- the admin UI auto-refreshes on player edits, team registrations,
-- competition status changes, and handicap adjustments.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.local_comp_players;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.local_comp_saved_teams;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.local_competitions;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.local_hcp_adjustments;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.local_comp_players REPLICA IDENTITY FULL;
ALTER TABLE public.local_comp_saved_teams REPLICA IDENTITY FULL;
ALTER TABLE public.local_competitions REPLICA IDENTITY FULL;
ALTER TABLE public.local_hcp_adjustments REPLICA IDENTITY FULL;