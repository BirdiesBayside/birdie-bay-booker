
CREATE OR REPLACE FUNCTION public.apply_local_comp_winners_tax()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  team_rec RECORD;
  min_net numeric;
  max_net numeric;
  delta numeric;
  reason_text text;
  norm_name text;
  new_hcp numeric;
  player_field text;
  prev_comp_id uuid;
  cur_p1_norm text;
  cur_p2_norm text;
  is_back_to_back boolean;
  win_delta numeric;
  win_reason text;
  is_winner boolean;
  is_last boolean;
BEGIN
  IF NEW.status <> 'completed' OR (OLD.status = 'completed') THEN
    RETURN NEW;
  END IF;

  -- Joint-aware: tie on net_score among scored teams
  SELECT MIN(net_score), MAX(net_score) INTO min_net, max_net
  FROM public.local_comp_teams
  WHERE competition_id = NEW.id AND position IS NOT NULL AND net_score IS NOT NULL;

  IF min_net IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find previous completed comp for back-to-back check
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
    -- Only mark "last" if there are multiple distinct net scores (avoid all-tied scenario)
    is_last := team_rec.net_score = max_net AND max_net <> min_net;

    delta := NULL; reason_text := NULL;

    IF is_winner THEN
      cur_p1_norm := lower(trim(team_rec.player1_name));
      cur_p2_norm := lower(trim(team_rec.player2_name));

      is_back_to_back := false;
      IF prev_comp_id IS NOT NULL THEN
        -- Back-to-back if this winning pair was ALSO a joint winner of previous comp
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

      IF is_back_to_back THEN
        win_delta := -4.0; win_reason := 'Back-to-back winning team (−4)';
      ELSE
        win_delta := -2.0; win_reason := 'Winning team (−2)';
      END IF;
      delta := win_delta; reason_text := win_reason;
    ELSIF is_last THEN
      delta := 2.0; reason_text := 'Last place team (+2)';
    END IF;

    IF delta IS NULL THEN CONTINUE; END IF;

    FOREACH player_field IN ARRAY ARRAY[team_rec.player1_name, team_rec.player2_name]
    LOOP
      norm_name := lower(trim(player_field));
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
