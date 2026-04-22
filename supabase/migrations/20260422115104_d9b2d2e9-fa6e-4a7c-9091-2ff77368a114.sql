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
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT MAX(position) INTO max_position
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL;

  FOR team_rec IN
    SELECT id, team_name, position, player1_name, player2_name
    FROM public.local_comp_teams
    WHERE competition_id = NEW.id AND position IS NOT NULL
    ORDER BY position
  LOOP
    delta := NULL;
    reason_text := NULL;

    IF team_rec.position = 1 THEN
      delta := -2.0; reason_text := 'Winning team (−2)';
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