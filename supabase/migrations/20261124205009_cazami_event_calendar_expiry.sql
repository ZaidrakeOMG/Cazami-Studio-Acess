alter table public.cazami_events add column if not exists expires_on date;
alter table public.cazami_events add constraint cazami_events_expiry_after_event check (expires_on is null or event_date is null or expires_on > event_date);
update public.cazami_events set expires_on=event_date+retention_days where expires_on is null and event_date is not null;
create or replace function cazami_internal.cleanup_due_events()
returns integer language plpgsql security definer set search_path=''
as $$
declare item record; n integer := 0;
begin
 for item in select id from public.cazami_events
 where event_date is not null and cleaned_at is null
 and coalesce(expires_on,event_date+retention_days) <= (now() at time zone timezone)::date
 loop
 perform cazami_internal.purge_one_event(item.id);
 n := n+1;
 end loop;
 return n;
end;
$$;
revoke all on function cazami_internal.cleanup_due_events() from public,anon,authenticated;