CREATE OR REPLACE FUNCTION public.apply_local_comp_winners_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  team_rec RECORD;
  min_net numeric;
  avg_net numeric;
  delta numeric;
  reason_text text;
  norm_name text;
  new_hcp numeric;
  player_field text;
  prev_comp_id uuid;
  cur_p1_norm text;
  cur_p2_norm text;
  is_back_to_back boolean;
  is_winner boolean;
  base_delta numeric;
  diff numeric;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT MIN(net_score), AVG(net_score) INTO min_net, avg_net
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL AND net_score IS NOT NULL;

  IF min_net IS NULL THEN
    RETURN NEW;
  END IF;

  -- Previous completed comp (for back-to-back winner check)
  SELECT c.id INTO prev_comp_id
  FROM public.local_competitions c
  WHERE c.status = 'completed'
    AND c.id <> NEW.id
    AND (c.date < NEW.date OR (c.date = NEW.date AND c.created_at < NEW.created_at))
  ORDER BY c.date DESC, c.created_at DESC
  LIMIT 1;

  FOR team_rec IN
    SELECT id, team_name, position, player1_name, player2_name, net_score
    FROM public.local_comp_teams
    WHERE competition_id = NEW.id AND position IS NOT NULL AND net_score IS NOT NULL
    ORDER BY position
  LOOP
    is_winner := team_rec.net_score = min_net;

    -- Field-relative base adjustment: 25% of gap to field average,
    -- rounded to nearest 0.5, capped at +/- 2.0
    diff := team_rec.net_score - avg_net;
    base_delta := round((diff * 0.25) / 0.5) * 0.5;
    base_delta := GREATEST(-2.0, LEAST(2.0, base_delta));

    delta := base_delta;
    reason_text := CASE
      WHEN base_delta < 0 THEN 'Net ' || round(abs(diff), 1) || ' better than field avg'
      WHEN base_delta > 0 THEN 'Net ' || round(abs(diff), 1) || ' worse than field avg'
      ELSE 'Around field average'
    END;

    IF is_winner THEN
      cur_p1_norm := lower(trim(team_rec.player1_name));
      cur_p2_norm := lower(trim(team_rec.player2_name));

      is_back_to_back := false;
      IF prev_comp_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1
          FROM public.local_comp_teams pt
          WHERE pt.competition_id = prev_comp_id
            AND pt.position IS NOT NULL AND pt.net_score IS NOT NULL
            AND pt.net_score = (
              SELECT MIN(net_score) FROM public.local_comp_teams
              WHERE competition_id = prev_comp_id AND position IS NOT NULL AND net_score IS NOT NULL
            )
            AND (
              (lower(trim(pt.player1_name)) = cur_p1_norm AND lower(trim(pt.player2_name)) = cur_p2_norm)
              OR (lower(trim(pt.player1_name)) = cur_p2_norm AND lower(trim(pt.player2_name)) = cur_p1_norm)
            )
        ) INTO is_back_to_back;
      END IF;

      delta := delta - 0.5;
      reason_text := reason_text || ' + winner (−0.5)';

      IF is_back_to_back THEN
        delta := delta - 1.5;
        reason_text := reason_text || ' + back-to-back win (−1.5)';
      END IF;
    END IF;

    IF delta = 0 THEN CONTINUE; END IF;

    FOREACH player_field IN ARRAY ARRAY[team_rec.player1_name, team_rec.player2_name]
    LOOP
      norm_name := lower(trim(COALESCE(player_field, '')));
      IF norm_name = '' THEN CONTINUE; END IF;

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