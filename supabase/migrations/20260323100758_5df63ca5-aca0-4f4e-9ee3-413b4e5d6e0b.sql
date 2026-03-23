
-- Create local_competitions table
CREATE TABLE public.local_competitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  date DATE NOT NULL,
  format TEXT NOT NULL DEFAULT '2-man-ambrose',
  entry_fee NUMERIC NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID NULL
);

-- Create local_comp_teams table
CREATE TABLE public.local_comp_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES public.local_competitions(id) ON DELETE CASCADE,
  team_name TEXT NOT NULL,
  player1_name TEXT NOT NULL,
  player1_handicap NUMERIC NOT NULL DEFAULT 0,
  player2_name TEXT NOT NULL,
  player2_handicap NUMERIC NOT NULL DEFAULT 0,
  combined_handicap NUMERIC NOT NULL DEFAULT 0,
  gross_score INTEGER NULL,
  net_score NUMERIC NULL,
  paid BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create local_comp_settings table
CREATE TABLE public.local_comp_settings (
  id TEXT NOT NULL DEFAULT 'global' PRIMARY KEY,
  default_entry_fee NUMERIC NOT NULL DEFAULT 10,
  default_format TEXT NOT NULL DEFAULT '2-man-ambrose',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.local_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_comp_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_comp_settings ENABLE ROW LEVEL SECURITY;

-- RLS for local_competitions
CREATE POLICY "Admins can manage local competitions" ON public.local_competitions
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view local competitions" ON public.local_competitions
  FOR SELECT USING (true);

-- RLS for local_comp_teams
CREATE POLICY "Admins can manage local comp teams" ON public.local_comp_teams
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view local comp teams" ON public.local_comp_teams
  FOR SELECT USING (true);

-- RLS for local_comp_settings
CREATE POLICY "Admins can manage local comp settings" ON public.local_comp_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view local comp settings" ON public.local_comp_settings
  FOR SELECT USING (true);

-- Enable realtime for live TV leaderboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.local_comp_teams;
