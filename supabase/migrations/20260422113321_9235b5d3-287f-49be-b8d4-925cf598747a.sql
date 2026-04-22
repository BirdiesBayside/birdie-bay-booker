
-- 1. Add local_hcp columns to saved teams (per-player local comp handicap)
ALTER TABLE public.local_comp_saved_teams
  ADD COLUMN IF NOT EXISTS player1_local_hcp numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS player2_local_hcp numeric NOT NULL DEFAULT 0;

-- Backfill: seed local_hcp from current handicap so existing teams keep parity
UPDATE public.local_comp_saved_teams
SET player1_local_hcp = player1_handicap,
    player2_local_hcp = player2_handicap
WHERE player1_local_hcp = 0 AND player2_local_hcp = 0;

-- 2. Adjustment audit log
CREATE TABLE IF NOT EXISTS public.local_hcp_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name text NOT NULL,
  player_name_normalized text NOT NULL,
  competition_id uuid REFERENCES public.local_competitions(id) ON DELETE CASCADE,
  competition_name text,
  position integer,
  delta numeric NOT NULL,
  reason text NOT NULL,
  hcp_before numeric,
  hcp_after numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_hcp_adjustments_player ON public.local_hcp_adjustments(player_name_normalized);
CREATE INDEX IF NOT EXISTS idx_local_hcp_adjustments_comp ON public.local_hcp_adjustments(competition_id);

ALTER TABLE public.local_hcp_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage local hcp adjustments"
  ON public.local_hcp_adjustments FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view local hcp adjustments"
  ON public.local_hcp_adjustments FOR SELECT
  USING (true);

-- 3. Trigger function: when comp flips to completed, apply Winner's Tax to all saved teams
CREATE OR REPLACE FUNCTION public.apply_local_comp_winners_tax()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  team_rec RECORD;
  max_position integer;
  delta numeric;
  reason_text text;
  norm_name text;
  current_hcp numeric;
  new_hcp numeric;
  player_field text;
BEGIN
  -- Only fire when transitioning into 'completed'
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  -- Find last position (for wooden-spoon boost)
  SELECT MAX(position) INTO max_position
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL;

  -- Iterate teams with a finishing position
  FOR team_rec IN
    SELECT id, team_name, position, player1_name, player2_name
    FROM public.local_comp_teams
    WHERE competition_id = NEW.id AND position IS NOT NULL
    ORDER BY position
  LOOP
    -- Determine delta
    delta := NULL;
    reason_text := NULL;

    IF team_rec.position = 1 THEN
      delta := -2.0; reason_text := '1st place penalty';
    ELSIF team_rec.position = 2 THEN
      delta := -1.0; reason_text := '2nd place penalty';
    ELSIF team_rec.position = 3 THEN
      delta := -0.5; reason_text := '3rd place penalty';
    ELSIF max_position IS NOT NULL AND team_rec.position = max_position AND max_position > 3 THEN
      delta := 0.5; reason_text := 'Last place boost';
    END IF;

    IF delta IS NULL THEN
      CONTINUE;
    END IF;

    -- Apply to both players via case-insensitive name match
    FOREACH player_field IN ARRAY ARRAY[team_rec.player1_name, team_rec.player2_name]
    LOOP
      norm_name := lower(trim(player_field));
      IF norm_name = '' THEN CONTINUE; END IF;

      -- Update player1 slots matching this name
      FOR current_hcp IN
        SELECT player1_local_hcp FROM public.local_comp_saved_teams
        WHERE lower(trim(player1_name)) = norm_name
      LOOP
        new_hcp := current_hcp + delta;
        UPDATE public.local_comp_saved_teams
        SET player1_local_hcp = new_hcp, updated_at = now()
        WHERE lower(trim(player1_name)) = norm_name;
        EXIT; -- only log once per name per slot type
      END LOOP;

      -- Update player2 slots matching this name
      FOR current_hcp IN
        SELECT player2_local_hcp FROM public.local_comp_saved_teams
        WHERE lower(trim(player2_name)) = norm_name
      LOOP
        new_hcp := current_hcp + delta;
        UPDATE public.local_comp_saved_teams
        SET player2_local_hcp = new_hcp, updated_at = now()
        WHERE lower(trim(player2_name)) = norm_name;
        EXIT;
      END LOOP;

      -- Compute representative before/after for the log (take most recent saved team)
      SELECT
        CASE WHEN lower(trim(player1_name)) = norm_name THEN player1_local_hcp
             ELSE player2_local_hcp END
      INTO new_hcp
      FROM public.local_comp_saved_teams
      WHERE lower(trim(player1_name)) = norm_name OR lower(trim(player2_name)) = norm_name
      ORDER BY updated_at DESC
      LIMIT 1;

      INSERT INTO public.local_hcp_adjustments
        (player_name, player_name_normalized, competition_id, competition_name, position, delta, reason, hcp_before, hcp_after)
      VALUES
        (player_field, norm_name, NEW.id, NEW.name, team_rec.position, delta, reason_text,
         COALESCE(new_hcp, 0) - delta, new_hcp);
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_local_comp_winners_tax ON public.local_competitions;
CREATE TRIGGER trg_apply_local_comp_winners_tax
  AFTER UPDATE ON public.local_competitions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_local_comp_winners_tax();
