-- Read only the event fields required by the server-side folio lookup.
grant select (folio,event_name,invitation_url,status,cleaned_at,expires_on,timezone) on public.cazami_events to service_role;
