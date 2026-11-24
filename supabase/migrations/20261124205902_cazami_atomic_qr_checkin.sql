CREATE OR REPLACE FUNCTION public.cazami_scan_pass(p_folio text, p_token text, p_request uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 e public.cazami_events%rowtype;
 v public.cazami_passes%rowtype;
 prior public.cazami_checkins%rowtype;
 remaining integer;
begin
 if auth.uid() is null or not cazami_internal.is_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if p_token is null or p_token !~ '^CZ1\.[0-9a-f]{48}$' then return jsonb_build_object('status','denied','message','Código QR inválido'); end if;
 select * into e from public.cazami_events where folio=upper(btrim(p_folio)) for update;
 if not found or e.cleaned_at is not null or e.status<>'active' or (e.expires_on is not null and e.expires_on <= (now() at time zone e.timezone)::date) then
 return jsonb_build_object('status','denied','message','Evento inactivo o caducado');
 end if;
 select * into v from public.cazami_passes where event_id=e.id and token_digest=encode(extensions.digest(p_token,'sha256'),'hex') for update;
 if not found or v.status<>'active' then return jsonb_build_object('status','denied','message','Pase inválido o de otra fiesta'); end if;
 if p_request is not null then
 select * into prior from public.cazami_checkins where request_key=p_request;
 if found then
 if prior.event_id=e.id and prior.pass_id=v.id and prior.operator_id=auth.uid() then return jsonb_build_object('status','registered','family',v.family_name,'people',prior.people_count,'pass_number',v.pass_number); end if;
 return jsonb_build_object('status','denied','message','Solicitud inválida');
 end if;
 end if;
 remaining:=v.max_people-v.used_people;
 if remaining<=0 then return jsonb_build_object('status','used','message','Pase ya utilizado','family',v.family_name,'people',v.max_people); end if;
 if p_request is null then return jsonb_build_object('status','allowed','family',v.family_name,'people',remaining,'pass_number',v.pass_number); end if;
 insert into public.cazami_checkins(event_id,pass_id,operator_id,people_count,request_key) values(e.id,v.id,auth.uid(),remaining,p_request);
 update public.cazami_passes set used_people=max_people,updated_at=now() where id=v.id;
 return jsonb_build_object('status','registered','family',v.family_name,'people',remaining,'pass_number',v.pass_number);
end;
$function$

;
revoke all on function public.cazami_scan_pass(text,text,uuid) from public,anon;
grant execute on function public.cazami_scan_pass(text,text,uuid) to authenticated;
