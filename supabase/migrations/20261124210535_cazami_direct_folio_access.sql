create or replace function cazami_internal.folio_access(p_folio text,p_action text,p_token text,p_request uuid,p_device text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.cazami_events%rowtype; v public.cazami_passes%rowtype; prior public.cazami_checkins%rowtype; guests jsonb; remaining integer;
begin
 if p_device is null or p_device !~ '^[0-9a-f-]{36}$' then return jsonb_build_object('status','unauthorized'); end if;
 select * into e from public.cazami_events where folio=upper(btrim(p_folio)) for update;
 if not found then return jsonb_build_object('status','denied','message','No existe esta fiesta'); end if;
 if e.cleaned_at is not null or e.status='finished' or (e.expires_on is not null and e.expires_on <= (now() at time zone e.timezone)::date) then return jsonb_build_object('status','denied','message','Evento finalizado o caducado'); end if;
 if p_action='list' then
 select coalesce(jsonb_agg(jsonb_build_object('pass_number',pass_number,'family_name',family_name,'max_people',max_people,'used_people',used_people,'status',status) order by pass_number),'[]'::jsonb) into guests from public.cazami_passes where event_id=e.id;
 return jsonb_build_object('status','ok','event_name',e.event_name,'active',e.status='active','passes',guests);
 end if;
 if p_action not in ('preview','register') or e.status<>'active' then return jsonb_build_object('status','denied','message','Evento inactivo o acción inválida'); end if;
 if p_token is null or p_token !~ '^CZ1\.[0-9a-f]{48}$' then return jsonb_build_object('status','denied','message','Código QR inválido'); end if;
 select * into v from public.cazami_passes where event_id=e.id and token_digest=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found or v.status<>'active' then return jsonb_build_object('status','denied','message','Pase inválido o de otra fiesta'); end if;
 if p_action='register' then
 if p_request is null then return jsonb_build_object('status','denied','message','Solicitud inválida'); end if;
 select * into prior from public.cazami_checkins where request_key=p_request;
 if found then
 if prior.event_id=e.id and prior.pass_id=v.id and prior.device_id=p_device then return jsonb_build_object('status','registered','family',v.family_name,'people',prior.people_count); end if;
 return jsonb_build_object('status','denied','message','Solicitud inválida');
 end if;
 end if;
 remaining:=v.max_people-v.used_people;
 if remaining<=0 then return jsonb_build_object('status','used','message','Pase ya utilizado','family',v.family_name,'people',v.max_people); end if;
 if p_action='preview' then return jsonb_build_object('status','allowed','family',v.family_name,'people',remaining); end if;
 insert into public.cazami_checkins(event_id,pass_id,device_id,people_count,request_key) values(e.id,v.id,p_device,remaining,p_request);
 update public.cazami_passes set used_people=max_people,updated_at=now() where id=v.id;
 return jsonb_build_object('status','registered','family',v.family_name,'people',remaining);
end $$;
revoke all on function cazami_internal.folio_access(text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function cazami_internal.folio_access(text,text,text,uuid,text) to service_role;
create or replace function public.cazami_folio_access(p_folio text,p_action text,p_token text,p_request uuid,p_device text)
returns jsonb language sql security invoker set search_path='' as $$ select cazami_internal.folio_access(p_folio,p_action,p_token,p_request,p_device) $$;
revoke all on function public.cazami_folio_access(text,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.cazami_folio_access(text,text,text,uuid,text) to service_role;
