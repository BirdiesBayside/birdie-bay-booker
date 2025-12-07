-- Add sgt_user_id and display_name to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS sgt_user_id integer,
ADD COLUMN IF NOT EXISTS display_name text;

-- Create SGT Members table
CREATE TABLE public.sgt_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id integer NOT NULL UNIQUE,
  user_name text NOT NULL,
  user_email text,
  user_country_code text,
  user_has_avatar text,
  user_active integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create SGT Tours table
CREATE TABLE public.sgt_tours (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id integer NOT NULL UNIQUE,
  name text NOT NULL,
  start_date date,
  end_date date,
  team_tour integer DEFAULT 0,
  active integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create SGT Tour Members table
CREATE TABLE public.sgt_tour_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id integer NOT NULL,
  user_id integer NOT NULL,
  user_name text,
  hcp_index numeric,
  custom_hcp numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tour_id, user_id)
);

-- Create SGT Tour Standings table
CREATE TABLE public.sgt_tour_standings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id integer NOT NULL,
  user_name text NOT NULL,
  country_code text,
  user_has_avatar text,
  hcp numeric,
  events integer DEFAULT 0,
  first integer DEFAULT 0,
  top5 integer DEFAULT 0,
  top10 integer DEFAULT 0,
  points integer DEFAULT 0,
  position integer NOT NULL,
  gross_or_net text NOT NULL DEFAULT 'gross',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tour_id, user_name, gross_or_net)
);

-- Create SGT Tournaments table
CREATE TABLE public.sgt_tournaments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id integer NOT NULL UNIQUE,
  tour_id integer NOT NULL,
  name text NOT NULL,
  course_name text,
  status text DEFAULT 'Upcoming',
  start_date date,
  end_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create SGT Scorecards table
CREATE TABLE public.sgt_scorecards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tournament_id integer NOT NULL,
  player_id integer NOT NULL,
  player_name text NOT NULL,
  hcp_index numeric,
  round integer DEFAULT 1,
  course_name text,
  teetype text,
  rating numeric,
  slope integer,
  total_gross integer,
  total_net integer,
  to_par_gross integer,
  to_par_net integer,
  in_gross integer,
  out_gross integer,
  in_net integer,
  out_net integer,
  hole_data jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, player_id, round)
);

-- Enable RLS on all tables
ALTER TABLE public.sgt_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgt_tours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgt_tour_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgt_tour_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgt_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgt_scorecards ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sgt_members (authenticated users can view)
CREATE POLICY "Authenticated users can view members"
ON public.sgt_members FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for sgt_tours (authenticated users can view)
CREATE POLICY "Authenticated users can view tours"
ON public.sgt_tours FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for sgt_tour_members (authenticated users can view)
CREATE POLICY "Authenticated users can view tour members"
ON public.sgt_tour_members FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for sgt_tour_standings (authenticated users can view)
CREATE POLICY "Authenticated users can view standings"
ON public.sgt_tour_standings FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for sgt_tournaments (authenticated users can view)
CREATE POLICY "Authenticated users can view tournaments"
ON public.sgt_tournaments FOR SELECT
TO authenticated
USING (true);

-- RLS Policies for sgt_scorecards (users can only view their own)
CREATE POLICY "Users can view their own scorecards"
ON public.sgt_scorecards FOR SELECT
TO authenticated
USING (
  player_id IN (
    SELECT sgt_user_id FROM public.profiles WHERE user_id = auth.uid()
  )
);

-- Create indexes for performance
CREATE INDEX idx_sgt_tour_standings_tour_id ON public.sgt_tour_standings(tour_id);
CREATE INDEX idx_sgt_tour_standings_gross_net ON public.sgt_tour_standings(gross_or_net);
CREATE INDEX idx_sgt_tournaments_tour_id ON public.sgt_tournaments(tour_id);
CREATE INDEX idx_sgt_scorecards_tournament_id ON public.sgt_scorecards(tournament_id);
CREATE INDEX idx_sgt_scorecards_player_id ON public.sgt_scorecards(player_id);
CREATE INDEX idx_sgt_tour_members_tour_id ON public.sgt_tour_members(tour_id);
CREATE INDEX idx_sgt_tour_members_user_id ON public.sgt_tour_members(user_id);
CREATE INDEX idx_profiles_sgt_user_id ON public.profiles(sgt_user_id);