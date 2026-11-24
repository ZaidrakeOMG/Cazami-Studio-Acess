-- CAZAMI Access migration deployed to the connected project.
-- cazami_audit_trigger_and_admin_status_fix

drop trigger if exists cazami_events_audit_trigger on public.cazami_events;

create or replace function cazami_internal.touch_event()
returns trigger language plpgsql set search_path=''
as $$
begin
  new.updated_at := now();
  if old.cleaned_at is not null and new.cleaned_at is distinct from old.cleaned_at then
    raise exception 'Un evento depurado no puede reabrirse';
  end if;
  return new;
end;
$$;
revoke all on function cazami_internal.touch_event() from public,anon,authenticated;
create trigger cazami_events_touch_trigger
before update on public.cazami_events
for each row execute function cazami_internal.touch_event();

create or replace function cazami_internal.on_event_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.cazami_audit_logs(event_id,actor_id,action,metadata)
  values (new.id,(select auth.uid()),lower(tg_op),
    jsonb_build_object('folio',new.folio,'status',new.status,'event_name',new.event_name));
  return new;
end;
$$;
revoke all on function cazami_internal.on_event_change() from public,anon,authenticated;
create trigger cazami_events_audit_trigger
after insert or update on public.cazami_events
for each row execute function cazami_internal.on_event_change();

create or replace function public.cazami_am_i_admin()
returns boolean language sql stable security invoker set search_path=''
as $$ select cazami_internal.is_admin(); $$;
revoke all on function public.cazami_am_i_admin() from public,anon;
grant execute on function public.cazami_am_i_admin() to authenticated;

