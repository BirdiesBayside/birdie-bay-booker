ALTER TABLE public.local_comp_teams 
ADD COLUMN player1_paid BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN player2_paid BOOLEAN NOT NULL DEFAULT false;