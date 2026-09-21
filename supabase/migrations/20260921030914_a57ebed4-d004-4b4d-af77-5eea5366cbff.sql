ALTER TABLE public.sim_cup_registrations
  ADD COLUMN IF NOT EXISTS team_number integer,
  ADD COLUMN IF NOT EXISTS team_name text,
  ADD COLUMN IF NOT EXISTS handicap numeric,
  ADD COLUMN IF NOT EXISTS handicap_source text;