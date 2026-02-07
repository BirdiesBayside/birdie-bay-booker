-- Create sgt_monthly_standings table for aggregated monthly scores
CREATE TABLE public.sgt_monthly_standings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tour_id INTEGER NOT NULL,
  month TEXT NOT NULL, -- e.g., "February 2026"
  player_name TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  total_net_score INTEGER, -- Sum of weekly to_par_net
  total_gross_score INTEGER, -- Sum of weekly to_par_gross
  tournaments_played INTEGER NOT NULL DEFAULT 0,
  best_net INTEGER, -- Best single-week net score
  best_gross INTEGER, -- Best single-week gross score
  net_position INTEGER, -- Calculated rank for net
  gross_position INTEGER, -- Calculated rank for gross
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(tour_id, month, player_id)
);

-- Enable Row Level Security
ALTER TABLE public.sgt_monthly_standings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage monthly standings"
ON public.sgt_monthly_standings
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view monthly standings"
ON public.sgt_monthly_standings
FOR SELECT
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_sgt_monthly_standings_updated_at
BEFORE UPDATE ON public.sgt_monthly_standings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for common queries
CREATE INDEX idx_sgt_monthly_standings_tour_month 
ON public.sgt_monthly_standings(tour_id, month);

CREATE INDEX idx_sgt_monthly_standings_player 
ON public.sgt_monthly_standings(player_id);