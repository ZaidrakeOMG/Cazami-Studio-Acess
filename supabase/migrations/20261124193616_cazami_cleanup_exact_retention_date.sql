-- CAZAMI Access migration deployed to the connected project.
-- cazami_cleanup_exact_retention_date
create or replace function cazami_internal.cleanup_due_events()
returns integer language plpgsql security definer set search_path=''
as $$
declare
  item record;
  n integer := 0;
begin
  for item in
    select id from public.cazami_events
      where event_date is not null and cleaned_at is null
        and event_date + retention_days <= (now() at time zone timezone)::date
  loop
    perform cazami_internal.purge_one_event(item.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function cazami_internal.cleanup_due_events() from public,anon,authenticated;
