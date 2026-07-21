DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT jobname FROM cron.job WHERE jobname = 'sgt-highlight-poller-2min' LOOP
    PERFORM cron.unschedule(r.jobname);
  END LOOP;
END $$;

SELECT cron.schedule(
  'sgt-highlight-poller-1min',
  '* * * * *',
  $$
  select net.http_post(
    url:='https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/sgt-highlight-poller',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhsdHJjdXlwdXhoZXRjanl2ZWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5NzM4NDIsImV4cCI6MjA4MDU0OTg0Mn0.Y5TxI5TEm9aQPZt8DWXGWVruJIzQfS6BXC5Z9u_27-I"}'::jsonb,
    body:='{}'::jsonb
  );
  $$
);