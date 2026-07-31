-- Helper: is a scorecard a full 18-hole round?
CREATE OR REPLACE FUNCTION public.sgt_is_full_18(hole_data jsonb, in_gross integer, out_gross integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN hole_data IS NOT NULL AND jsonb_typeof(hole_data) = 'object' THEN (
      SELECT count(*) = 18
      FROM generate_series(1, 18) g
      WHERE COALESCE(NULLIF(hole_data->>('hole' || g || '_gross'), '')::numeric, 0) > 0
    )
    ELSE COALESCE(in_gross, 0) > 0 AND COALESCE(out_gross, 0) > 0
  END
$$;

-- Career completed-round counts per player (aggregate only, no score detail)
CREATE OR REPLACE FUNCTION public.sgt_player_round_counts()
RETURNS TABLE (player_id integer, player_name text, completed_rounds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.player_id,
         max(s.player_name) AS player_name,
         count(*) AS completed_rounds
  FROM public.sgt_scorecards s
  WHERE s.total_gross IS NOT NULL
    AND public.sgt_is_full_18(s.hole_data, s.in_gross, s.out_gross)
  GROUP BY s.player_id
$$;

-- For a given tournament (week): each entrant and how many full rounds they
-- had completed BEFORE that week started. Used for the (E) exempt badge.
CREATE OR REPLACE FUNCTION public.sgt_week_round_history(p_tournament_id integer)
RETURNS TABLE (player_id integer, player_name text, prior_rounds bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tgt AS (
    SELECT tournament_id, start_date
    FROM public.sgt_tournaments
    WHERE tournament_id = p_tournament_id
  ),
  entrants AS (
    SELECT s.player_id, max(s.player_name) AS player_name
    FROM public.sgt_scorecards s
    WHERE s.tournament_id = p_tournament_id
    GROUP BY s.player_id
  )
  SELECT e.player_id,
         e.player_name,
         (
           SELECT count(*)
           FROM public.sgt_scorecards s2
           JOIN public.sgt_tournaments t2 ON t2.tournament_id = s2.tournament_id
           WHERE s2.player_id = e.player_id
             AND s2.total_gross IS NOT NULL
             AND t2.start_date < (SELECT start_date FROM tgt)
             AND public.sgt_is_full_18(s2.hole_data, s2.in_gross, s2.out_gross)
         ) AS prior_rounds
  FROM entrants e
$$;

GRANT EXECUTE ON FUNCTION public.sgt_player_round_counts() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sgt_week_round_history(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sgt_is_full_18(jsonb, integer, integer) TO anon, authenticated, service_role;

-- Unlock the Birdies custom handicap after 3 rounds instead of 6
UPDATE public.sgt_handicap_settings
SET rounds_required = 3, updated_at = now()
WHERE id = 'global';
