
CREATE TABLE public.local_comp_saved_teams (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_name TEXT NOT NULL,
  player1_name TEXT NOT NULL,
  player1_handicap NUMERIC NOT NULL DEFAULT 0,
  player2_name TEXT NOT NULL,
  player2_handicap NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.local_comp_saved_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage saved teams"
ON public.local_comp_saved_teams
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view active saved teams"
ON public.local_comp_saved_teams
FOR SELECT
USING (is_active = true);

CREATE TRIGGER update_local_comp_saved_teams_updated_at
BEFORE UPDATE ON public.local_comp_saved_teams
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
