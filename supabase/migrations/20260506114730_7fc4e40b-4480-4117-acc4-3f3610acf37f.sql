-- 1. Single source of truth for player comp handicaps
CREATE TABLE IF NOT EXISTS public.local_comp_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_normalized text NOT NULL UNIQUE,
  handicap numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.local_comp_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view players"
  ON public.local_comp_players FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage players"
  ON public.local_comp_players FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can add players"
  ON public.local_comp_players FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE TRIGGER update_local_comp_players_updated_at
  BEFORE UPDATE ON public.local_comp_players
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed from existing saved teams (use current local_hcp as starting point)
INSERT INTO public.local_comp_players (name, name_normalized, handicap)
SELECT DISTINCT ON (lower(trim(name)))
  trim(name) AS name,
  lower(trim(name)) AS name_normalized,
  hcp AS handicap
FROM (
  SELECT player1_name AS name, player1_local_hcp AS hcp, updated_at FROM public.local_comp_saved_teams WHERE trim(player1_name) <> ''
  UNION ALL
  SELECT player2_name AS name, player2_local_hcp AS hcp, updated_at FROM public.local_comp_saved_teams WHERE trim(player2_name) <> ''
) src
ORDER BY lower(trim(name)), updated_at DESC
ON CONFLICT (name_normalized) DO NOTHING;

-- 3. Rewrite Winner's Tax trigger to update local_comp_players (single source of truth)
CREATE OR REPLACE FUNCTION public.apply_local_comp_winners_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  team_rec RECORD;
  max_position integer;
  delta numeric;
  reason_text text;
  norm_name text;
  current_hcp numeric;
  new_hcp numeric;
  player_field text;
  prev_winner_p1 text;
  prev_winner_p2 text;
  cur_p1_norm text;
  cur_p2_norm text;
  is_back_to_back boolean;
  win_delta numeric;
  win_reason text;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT MAX(position) INTO max_position
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL;

  SELECT lower(trim(t.player1_name)), lower(trim(t.player2_name))
    INTO prev_winner_p1, prev_winner_p2
  FROM public.local_competitions c
  JOIN public.local_comp_teams t ON t.competition_id = c.id AND t.position = 1
  WHERE c.status = 'completed'
    AND c.id <> NEW.id
    AND (c.date < NEW.date OR (c.date = NEW.date AND c.created_at < NEW.created_at))
  ORDER BY c.date DESC, c.created_at DESC
  LIMIT 1;

  SELECT lower(trim(player1_name)), lower(trim(player2_name))
    INTO cur_p1_norm, cur_p2_norm
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position = 1
  LIMIT 1;

  is_back_to_back := prev_winner_p1 IS NOT NULL
    AND ((cur_p1_norm = prev_winner_p1 AND cur_p2_norm = prev_winner_p2)
      OR (cur_p1_norm = prev_winner_p2 AND cur_p2_norm = prev_winner_p1));

  IF is_back_to_back THEN
    win_delta := -4.0; win_reason := 'Back-to-back winning team (−4)';
  ELSE
    win_delta := -2.0; win_reason := 'Winning team (−2)';
  END IF;

  FOR team_rec IN
    SELECT id, team_name, position, player1_name, player2_name
    FROM public.local_comp_teams
    WHERE competition_id = NEW.id AND position IS NOT NULL
    ORDER BY position
  LOOP
    delta := NULL; reason_text := NULL;
    IF team_rec.position = 1 THEN
      delta := win_delta; reason_text := win_reason;
    ELSIF max_position IS NOT NULL AND team_rec.position = max_position AND max_position > 1 THEN
      delta := 2.0; reason_text := 'Last place team (+2)';
    END IF;

    IF delta IS NULL THEN CONTINUE; END IF;

    FOREACH player_field IN ARRAY ARRAY[team_rec.player1_name, team_rec.player2_name]
    LOOP
      norm_name := lower(trim(player_field));
      IF norm_name = '' THEN CONTINUE; END IF;

      -- Upsert player and update handicap
      INSERT INTO public.local_comp_players (name, name_normalized, handicap)
      VALUES (trim(player_field), norm_name, GREATEST(0, delta))
      ON CONFLICT (name_normalized) DO UPDATE
        SET handicap = GREATEST(0, public.local_comp_players.handicap + delta),
            updated_at = now()
      RETURNING handicap INTO new_hcp;

      INSERT INTO public.local_hcp_adjustments
        (player_name, player_name_normalized, competition_id, competition_name, position, delta, reason, hcp_before, hcp_after)
      VALUES
        (player_field, norm_name, NEW.id, NEW.name, team_rec.position, delta, reason_text,
         new_hcp - delta, new_hcp);
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$function$;