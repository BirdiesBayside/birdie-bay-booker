select cron.unschedule('door-code-sync') where exists (select 1 from cron.job where jobname = 'door-code-sync');

select cron.schedule(
  'door-code-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://hltrcuypuxhetcjyvedl.supabase.co/functions/v1/door-code-manager',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('action', 'sync')
  );
  $$
);