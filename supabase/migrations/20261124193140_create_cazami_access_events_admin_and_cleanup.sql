-- CAZAMI Access migration deployed to the connected project.
-- create_cazami_access_events_admin_and_cleanup

-- CAZAMI Access: isolated, prefixed schema in Party-book; never touches pre-existing project tables.
create schema if not exists cazami_internal;
revoke all on schema cazami_internal from public, anon;
grant usage on schema cazami_internal to authenticated;

create table if not exists public.cazami_admin_allowlist (
  email text primary key check (email = lower(email)),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.cazami_admin_allowlist enable row level security;
revoke all on public.cazami_admin_allowlist from public, anon, authenticated;
insert into public.cazami_admin_allowlist(email) values ('zaidfarjat@gmail.com') on conflict do nothing;

create or replace function cazami_internal.is_admin()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select exists(
    select 1
    from auth.users u
    join public.cazami_admin_allowlist a on a.email = lower(u.email)
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and a.active
  );
$$;
revoke all on function cazami_internal.is_admin() from public, anon;
grant execute on function cazami_internal.is_admin() to authenticated;

create sequence if not exists public.cazami_folio_seq as bigint start with 1;
revoke all on sequence public.cazami_folio_seq from public, anon;
grant usage on sequence public.cazami_folio_seq to authenticated;

create table if not exists public.cazami_events (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique default ('CA-' || nextval('public.cazami_folio_seq'::regclass)::text),
  event_name text not null check (length(btrim(event_name)) between 2 and 160),
  client_name text not null default '',
  event_type text not null default 'Otro',
  invitation_url text not null check (invitation_url ~* '^https://[^[:space:]]+$'),
  event_date date,
  timezone text not null default 'America/Monterrey',
  max_passes integer not null default 100 check (max_passes between 1 and 100000),
  max_people integer not null default 300 check (max_people between 1 and 1000000),
  status text not null default 'draft' check (status in ('draft','active','paused','finished')),
  retention_days integer not null default 30 check (retention_days between 1 and 365),
  historical_passes integer not null default 0 check (historical_passes >= 0),
  historical_people integer not null default 0 check (historical_people >= 0),
  historical_entries integer not null default 0 check (historical_entries >= 0),
  cleaned_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cazami_events_valid_folio check (folio ~ '^CA-[1-9][0-9]*$')
);
create index if not exists cazami_events_status_date_idx on public.cazami_events(status,event_date);
create index if not exists cazami_events_cleanup_idx on public.cazami_events(event_date,retention_days) where cleaned_at is null;

create table if not exists public.cazami_event_memberships(
  event_id uuid not null references public.cazami_events(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('client','supervisor','operator')),
  created_at timestamptz not null default now(),
  primary key (event_id,user_id)
);
create index if not exists cazami_event_memberships_user_idx on public.cazami_event_memberships(user_id);

create table if not exists public.cazami_passes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.cazami_events(id) on delete restrict,
  pass_number integer not null check (pass_number > 0),
  family_name text not null check (length(btrim(family_name)) between 1 and 150),
  max_people integer not null check (max_people between 1 and 1000),
  used_people integer not null default 0 check (used_people >= 0 and used_people <= max_people),
  table_number text,
  phone text,
  observations text,
  type text not null default 'general',
  status text not null default 'active' check (status in ('active','cancelled')),
  token_digest text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,pass_number)
);
create index if not exists cazami_passes_event_status_idx on public.cazami_passes(event_id,status);
create index if not exists cazami_passes_event_family_idx on public.cazami_passes(event_id,family_name);

create table if not exists public.cazami_checkins(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.cazami_events(id) on delete restrict,
  pass_id uuid references public.cazami_passes(id) on delete set null,
  operator_id uuid references auth.users(id) on delete set null,
  people_count integer not null check(people_count>0),
  request_key uuid not null unique,
  device_id text,
  occurred_at timestamptz not null default now()
);
create index if not exists cazami_checkins_event_created_idx on public.cazami_checkins(event_id,occurred_at desc);

create table if not exists public.cazami_audit_logs(
  id bigint generated always as identity primary key,
  event_id uuid references public.cazami_events(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists cazami_audit_event_idx on public.cazami_audit_logs(event_id,created_at desc);

alter table public.cazami_events enable row level security;
alter table public.cazami_event_memberships enable row level security;
alter table public.cazami_passes enable row level security;
alter table public.cazami_checkins enable row level security;
alter table public.cazami_audit_logs enable row level security;

revoke all on public.cazami_events,public.cazami_event_memberships,public.cazami_passes,public.cazami_checkins,public.cazami_audit_logs from anon;
grant select,insert,update on public.cazami_events to authenticated;
grant select on public.cazami_event_memberships,public.cazami_passes,public.cazami_checkins,public.cazami_audit_logs to authenticated;
grant insert on public.cazami_event_memberships to authenticated;

create policy cazami_events_read_admin on public.cazami_events for select to authenticated
  using (cazami_internal.is_admin());
create policy cazami_events_add_admin on public.cazami_events for insert to authenticated
  with check (cazami_internal.is_admin());
create policy cazami_events_edit_admin on public.cazami_events for update to authenticated
  using (cazami_internal.is_admin()) with check (cazami_internal.is_admin());

create policy cazami_memberships_admin_read on public.cazami_event_memberships for select to authenticated
  using (cazami_internal.is_admin() or user_id=(select auth.uid()));
create policy cazami_memberships_admin_add on public.cazami_event_memberships for insert to authenticated
  with check(cazami_internal.is_admin());
create policy cazami_passes_admin_read on public.cazami_passes for select to authenticated
  using(cazami_internal.is_admin());
create policy cazami_checkins_admin_read on public.cazami_checkins for select to authenticated
  using(cazami_internal.is_admin());
create policy cazami_audit_admin_read on public.cazami_audit_logs for select to authenticated
  using(cazami_internal.is_admin());

create or replace function cazami_internal.on_event_change()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if old.cleaned_at is not null and new.cleaned_at is distinct from old.cleaned_at then
      raise exception 'An already cleaned event cannot be cleaned again';
    end if;
  end if;
  insert into public.cazami_audit_logs(event_id,actor_id,action,metadata)
  values (new.id,(select auth.uid()),lower(tg_op),
    jsonb_build_object('folio',new.folio,'status',new.status,'event_name',new.event_name));
  return new;
end;
$$;
revoke all on function cazami_internal.on_event_change() from public,anon,authenticated;
create trigger cazami_events_audit_trigger
before insert or update on public.cazami_events
for each row execute function cazami_internal.on_event_change();

create or replace function cazami_internal.purge_one_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  evt public.cazami_events%rowtype;
  p_count integer;
  persons integer;
  entries integer;
begin
  select * into evt from public.cazami_events where id=p_event_id for update;
  if not found then raise exception 'Evento no encontrado'; end if;
  if evt.cleaned_at is not null then
    return jsonb_build_object('ok',true,'already_clean',true,'folio',evt.folio);
  end if;
  if evt.event_date is null or evt.event_date >= (now() at time zone evt.timezone)::date then
    raise exception 'No es posible depurar pases antes de la fecha del evento';
  end if;
  select count(*)::integer,coalesce(sum(max_people),0)::integer
    into p_count,persons from public.cazami_passes where event_id=p_event_id;
  select coalesce(sum(people_count),0)::integer into entries
    from public.cazami_checkins where event_id=p_event_id;

  update public.cazami_events set
      status='finished',
      historical_passes=historical_passes+p_count,
      historical_people=historical_people+persons,
      historical_entries=historical_entries+entries,
      cleaned_at=now(),
      updated_at=now()
    where id=p_event_id;
  delete from public.cazami_passes where event_id=p_event_id;
  insert into public.cazami_audit_logs(event_id,actor_id,action,metadata)
    values (p_event_id,(select auth.uid()),'passes_purged',
      jsonb_build_object('folio',evt.folio,'passes_deleted',p_count,'people_summary',persons,'entries_summary',entries));
  return jsonb_build_object('ok',true,'folio',evt.folio,'passes_deleted',p_count,'historical_saved',true);
end;
$$;
revoke all on function cazami_internal.purge_one_event(uuid) from public, anon, authenticated;

create or replace function public.cazami_purge_event(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
begin
  if not cazami_internal.is_admin() then raise exception 'No autorizado'; end if;
  return cazami_internal.purge_one_event(p_event_id);
end;
$$;
revoke all on function public.cazami_purge_event(uuid) from public,anon;
grant execute on function public.cazami_purge_event(uuid) to authenticated;

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
        and event_date + retention_days < (now() at time zone timezone)::date
  loop
    perform cazami_internal.purge_one_event(item.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function cazami_internal.cleanup_due_events() from public,anon,authenticated;

