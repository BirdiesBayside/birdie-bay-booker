
-- Trigger: when a profile's membership_tier upgrades TO birdie/eagle, immediately kick off
-- the SGT sync so re-signed-up members are added back to the club, tour, and tournament
-- without waiting for the daily cron.
CREATE OR REPLACE FUNCTION public.trigger_sgt_sync_on_membership_activation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.membership_tier IN ('birdie', 'eagle')
     AND (OLD.membership_tier IS NULL OR OLD.membership_tier NOT IN ('birdie', 'eagle')) THEN
    PERFORM net.http_post(
      url := 'https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/sgt-sync-eligible',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('trigger', 'membership_activation', 'user_id', NEW.user_id)
    );
    RAISE LOG '[SGT-SYNC-TRIGGER] Fired for user_id: % (tier: %)', NEW.user_id, NEW.membership_tier;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sgt_sync_on_membership_activation ON public.profiles;
CREATE TRIGGER trg_sgt_sync_on_membership_activation
AFTER UPDATE OF membership_tier ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sgt_sync_on_membership_activation();
