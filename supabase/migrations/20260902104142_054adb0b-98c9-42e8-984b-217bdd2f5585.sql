CREATE OR REPLACE FUNCTION public.apply_local_comp_winners_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  team_rec RECORD;
  min_net numeric;
  team_count integer;
  avg_gross numeric;
  gross_gap numeric;
  gross_extra numeric;
  pct numeric;
  score numeric;
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
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  SELECT MIN(net_score), COUNT(*) INTO min_net, team_count
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL AND net_score IS NOT NULL;

  IF min_net IS NULL OR team_count < 2 THEN
    RETURN NEW;
  END IF;

  SELECT AVG(gross_score) INTO avg_gross
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL AND gross_score IS NOT NULL;

  SELECT c.id INTO prev_comp_id
  FROM public.local_competitions c
  WHERE c.status = 'completed'
    AND c.id <> NEW.id
    AND (c.date < NEW.date OR (c.date = NEW.date AND c.created_at < NEW.created_at))
  ORDER BY c.date DESC, c.created_at DESC
  LIMIT 1;

  FOR team_rec IN
    SELECT id, team_name, position, player1_name, player2_name, net_score, gross_score
    FROM public.local_comp_teams
    WHERE competition_id = NEW.id AND position IS NOT NULL AND net_score IS NOT NULL
    ORDER BY position
  LOOP
    is_winner := team_rec.net_score = min_net;

    pct := (LEAST(team_rec.position, team_count) - 1)::numeric / (team_count - 1)::numeric;
    score := (pct - 0.5) * 2;

    IF abs(score) < 0.45 THEN
      base_delta := 0;
    ELSE
      base_delta := round((score * 1.5) / 0.5) * 0.5;
      base_delta := GREATEST(-1.5, LEAST(1.5, base_delta));
    END IF;

    delta := base_delta;
    reason_text := CASE
      WHEN base_delta < 0 THEN 'Finished ' || team_rec.position || ' of ' || team_count || ' (top of field)'
      WHEN base_delta > 0 THEN 'Finished ' || team_rec.position || ' of ' || team_count || ' (bottom of field)'
      ELSE 'Finished ' || team_rec.position || ' of ' || team_count || ' (mid-field, no change)'
    END;

    -- Gross-score sanity check: teams shooting well below the field's raw gross
    -- are clearly playing better than their handicap suggests.
    gross_extra := 0;
    IF avg_gross IS NOT NULL AND team_rec.gross_score IS NOT NULL THEN
      gross_gap := avg_gross - team_rec.gross_score;
      IF gross_gap >= 6 THEN
        gross_extra := -1.0;
      ELSIF gross_gap >= 3 THEN
        gross_extra := -0.5;
      END IF;

      IF gross_extra <> 0 THEN
        delta := delta + gross_extra;
        reason_text := reason_text || ' + gross ' || round(gross_gap, 1)
          || ' better than field avg (' || gross_extra || ')';
      END IF;
    END IF;

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

      -- Plus handicaps (better than scratch) are stored as negatives, SGT-style.
      -- Floor at -10 to catch data-entry runaways, but allow genuine plus players.
      INSERT INTO public.local_comp_players (name, name_normalized, handicap)
      VALUES (trim(player_field), norm_name, GREATEST(-10, delta))
      ON CONFLICT (name_normalized) DO UPDATE
        SET handicap = GREATEST(-10, public.local_comp_players.handicap + delta),
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