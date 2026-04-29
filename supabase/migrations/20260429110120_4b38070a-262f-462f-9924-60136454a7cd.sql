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

  -- Find previous completed competition's winning team (most recent before this one)
  SELECT lower(trim(t.player1_name)), lower(trim(t.player2_name))
    INTO prev_winner_p1, prev_winner_p2
  FROM public.local_competitions c
  JOIN public.local_comp_teams t ON t.competition_id = c.id AND t.position = 1
  WHERE c.status = 'completed'
    AND c.id <> NEW.id
    AND (c.date < NEW.date OR (c.date = NEW.date AND c.created_at < NEW.created_at))
  ORDER BY c.date DESC, c.created_at DESC
  LIMIT 1;

  -- Get current winning team players
  SELECT lower(trim(player1_name)), lower(trim(player2_name))
    INTO cur_p1_norm, cur_p2_norm
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position = 1
  LIMIT 1;

  is_back_to_back := prev_winner_p1 IS NOT NULL
    AND ((cur_p1_norm = prev_winner_p1 AND cur_p2_norm = prev_winner_p2)
      OR (cur_p1_norm = prev_winner_p2 AND cur_p2_norm = prev_winner_p1));

  IF is_back_to_back THEN
    win_delta := -4.0;
    win_reason := 'Back-to-back winning team (−4)';
  ELSE
    win_delta := -2.0;
    win_reason := 'Winning team (−2)';
  END IF;

  FOR team_rec IN
    SELECT id, team_name, position, player1_name, player2_name
    FROM public.local_comp_teams
    WHERE competition_id = NEW.id AND position IS NOT NULL
    ORDER BY position
  LOOP
    delta := NULL;
    reason_text := NULL;

    IF team_rec.position = 1 THEN
      delta := win_delta; reason_text := win_reason;
    ELSIF max_position IS NOT NULL AND team_rec.position = max_position AND max_position > 1 THEN
      delta := 2.0; reason_text := 'Last place team (+2)';
    END IF;

    IF delta IS NULL THEN
      CONTINUE;
    END IF;

    FOREACH player_field IN ARRAY ARRAY[team_rec.player1_name, team_rec.player2_name]
    LOOP
      norm_name := lower(trim(player_field));
      IF norm_name = '' THEN CONTINUE; END IF;

      FOR current_hcp IN
        SELECT player1_local_hcp FROM public.local_comp_saved_teams
        WHERE lower(trim(player1_name)) = norm_name
      LOOP
        new_hcp := current_hcp + delta;
        UPDATE public.local_comp_saved_teams
        SET player1_local_hcp = new_hcp, updated_at = now()
        WHERE lower(trim(player1_name)) = norm_name;
        EXIT;
      END LOOP;

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
$function$;