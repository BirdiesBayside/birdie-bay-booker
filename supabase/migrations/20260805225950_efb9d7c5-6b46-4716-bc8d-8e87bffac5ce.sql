CREATE OR REPLACE FUNCTION public.local_comp_first_timer_flags(p_competition_id uuid)
RETURNS TABLE(team_id uuid, is_first_timer boolean, net_vs_par numeric, flagged boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH comp AS (
    SELECT c.id, c.date, c.created_at,
           COALESCE((SELECT sc.par FROM public.sgt_courses sc WHERE sc.course_id = c.course_id LIMIT 1), 72) AS par
    FROM public.local_competitions c
    WHERE c.id = p_competition_id
  ),
  t AS (
    SELECT lt.id,
           lower(trim(lt.player1_name)) AS p1,
           lower(trim(lt.player2_name)) AS p2,
           lt.net_score
    FROM public.local_comp_teams lt
    WHERE lt.competition_id = p_competition_id
  )
  SELECT t.id AS team_id,
         NOT EXISTS (
           SELECT 1
           FROM public.local_comp_teams pt
           JOIN public.local_competitions pc ON pc.id = pt.competition_id
           CROSS JOIN comp
           WHERE pt.competition_id <> p_competition_id
             AND pt.net_score IS NOT NULL
             AND (pc.date < comp.date OR (pc.date = comp.date AND pc.created_at < comp.created_at))
             AND (
               (lower(trim(pt.player1_name)) = t.p1 AND lower(trim(pt.player2_name)) = t.p2)
               OR (lower(trim(pt.player1_name)) = t.p2 AND lower(trim(pt.player2_name)) = t.p1)
             )
         ) AS is_first_timer,
         CASE WHEN t.net_score IS NULL THEN NULL
              ELSE t.net_score - (SELECT par FROM comp) END AS net_vs_par,
         CASE
           WHEN t.net_score IS NULL THEN false
           WHEN t.net_score - (SELECT par FROM comp) <= -10
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.local_comp_teams pt
                  JOIN public.local_competitions pc ON pc.id = pt.competition_id
                  CROSS JOIN comp
                  WHERE pt.competition_id <> p_competition_id
                    AND pt.net_score IS NOT NULL
                    AND (pc.date < comp.date OR (pc.date = comp.date AND pc.created_at < comp.created_at))
                    AND (
                      (lower(trim(pt.player1_name)) = t.p1 AND lower(trim(pt.player2_name)) = t.p2)
                      OR (lower(trim(pt.player1_name)) = t.p2 AND lower(trim(pt.player2_name)) = t.p1)
                    )
                ) THEN true
           ELSE false
         END AS flagged
  FROM t;
$$;

GRANT EXECUTE ON FUNCTION public.local_comp_first_timer_flags(uuid) TO anon, authenticated, service_role;