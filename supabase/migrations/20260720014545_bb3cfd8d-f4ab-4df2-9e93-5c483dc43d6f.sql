DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname = 'sgt-highlight-poller-1min' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'sgt-highlight-poller-1min',
  '* * * * *',
  $$SELECT net.http_post(
    url := 'https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/sgt-highlight-poller',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('trigger', 'cron')
  );$$
);