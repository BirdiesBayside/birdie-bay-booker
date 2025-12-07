-- Add foreign key relationships for SGT tables
-- These are needed for Supabase client to perform joins

-- sgt_tour_members -> sgt_tours
ALTER TABLE sgt_tour_members 
ADD CONSTRAINT fk_sgt_tour_members_tour 
FOREIGN KEY (tour_id) REFERENCES sgt_tours(tour_id) ON DELETE CASCADE;

-- sgt_scorecards -> sgt_tournaments
ALTER TABLE sgt_scorecards 
ADD CONSTRAINT fk_sgt_scorecards_tournament 
FOREIGN KEY (tournament_id) REFERENCES sgt_tournaments(tournament_id) ON DELETE CASCADE;

-- sgt_tour_standings -> sgt_tours
ALTER TABLE sgt_tour_standings 
ADD CONSTRAINT fk_sgt_tour_standings_tour 
FOREIGN KEY (tour_id) REFERENCES sgt_tours(tour_id) ON DELETE CASCADE;

-- sgt_tournaments -> sgt_tours
ALTER TABLE sgt_tournaments 
ADD CONSTRAINT fk_sgt_tournaments_tour 
FOREIGN KEY (tour_id) REFERENCES sgt_tours(tour_id) ON DELETE CASCADE;