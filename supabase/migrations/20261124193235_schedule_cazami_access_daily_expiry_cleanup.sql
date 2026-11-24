-- CAZAMI Access migration deployed to the connected project.
-- schedule_cazami_access_daily_expiry_cleanup

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule(
  'cazami_access_cleanup_expired_passes',
  '17 9 * * *',
  $job$select cazami_internal.cleanup_due_events();$job$
);

