CREATE OR REPLACE FUNCTION public.local_comp_first_timer_flags(p_competition_id uuid)
 RETURNS TABLE(team_id uuid, is_first_timer boolean, net_vs_par numeric, flagged boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_course_par integer;
  v_comp_date date;
BEGIN
  SELECT c.date, COALESCE(sc.par, 72)
  INTO v_comp_date, v_course_par
  FROM local_competitions c
  LEFT JOIN sgt_courses sc ON sc.course_id = c.course_id
  WHERE c.id = p_competition_id;

  RETURN QUERY
  WITH current_teams AS (
    SELECT
      t.id,
      LOWER(TRIM(REGEXP_REPLACE(t.player1_name, '\s+', ' ', 'g'))) AS p1,
      LOWER(TRIM(REGEXP_REPLACE(t.player2_name, '\s+', ' ', 'g'))) AS p2,
      t.net_score
    FROM local_comp_teams t
    WHERE t.competition_id = p_competition_id
  ),
  prior_pairings AS (
    SELECT DISTINCT
      LOWER(TRIM(REGEXP_REPLACE(t.player1_name, '\s+', ' ', 'g'))) AS p1,
      LOWER(TRIM(REGEXP_REPLACE(t.player2_name, '\s+', ' ', 'g'))) AS p2
    FROM local_comp_teams t
    JOIN local_competitions c ON c.id = t.competition_id
    WHERE c.date < v_comp_date
      AND t.net_score IS NOT NULL
  ),
  debut AS (
    SELECT
      ct.id AS team_id,
      NOT EXISTS (
        SELECT 1
        FROM prior_pairings pp
        WHERE (pp.p1 = ct.p1 AND pp.p2 = ct.p2)
           OR (pp.p1 = ct.p2 AND pp.p2 = ct.p1)
      ) AS is_debut
    FROM current_teams ct
  )
  SELECT
    ct.id,
    d.is_debut,
    (ct.net_score - v_course_par)::numeric,
    (d.is_debut AND ct.net_score IS NOT NULL AND (ct.net_score - v_course_par) <= -5)
  FROM current_teams ct
  JOIN debut d ON d.team_id = ct.id;
END;
$function$;