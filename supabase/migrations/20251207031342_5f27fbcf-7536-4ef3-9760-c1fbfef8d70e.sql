-- Add unique constraints needed for upserts
ALTER TABLE public.sgt_members ADD CONSTRAINT sgt_members_user_id_unique UNIQUE (user_id);
ALTER TABLE public.sgt_tours ADD CONSTRAINT sgt_tours_tour_id_unique UNIQUE (tour_id);
ALTER TABLE public.sgt_tour_standings ADD CONSTRAINT sgt_tour_standings_unique UNIQUE (tour_id, user_name, gross_or_net);
ALTER TABLE public.sgt_tour_members ADD CONSTRAINT sgt_tour_members_unique UNIQUE (tour_id, user_id);
ALTER TABLE public.sgt_tournaments ADD CONSTRAINT sgt_tournaments_tournament_id_unique UNIQUE (tournament_id);
ALTER TABLE public.sgt_scorecards ADD CONSTRAINT sgt_scorecards_unique UNIQUE (tournament_id, player_id, round);