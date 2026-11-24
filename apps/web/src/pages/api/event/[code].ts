import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
export const prerender=false;
const json=(data:object,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const GET:APIRoute=async({params})=>{
 const folio=String(params.code||'').trim().toUpperCase();
 if(!/^CA-[1-9][0-9]{0,10}$/.test(folio))return json({error:'Código inválido.'},400);
 const url=import.meta.env.PUBLIC_SUPABASE_URL;
 const secret=import.meta.env.SUPABASE_SECRET_KEY;
 if(!url||!secret)return json({error:'Servicio no configurado.'},503);
 try{
  const sb=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await sb.from('cazami_events').select('folio,event_name,invitation_url,status,cleaned_at').eq('folio',folio).maybeSingle();
  if(error)return json({error:'Error al consultar el evento.'},503);
  if(!data)return json({error:'No existe una fiesta con ese código.'},404);
  const labels:{[k:string]:string}={draft:'Evento en preparación',active:'Evento activo',paused:'Evento suspendido',finished:'Evento finalizado'};
  // Never expose internal UUID, guest data, passes, phone numbers or admin permissions.
  return json({folio:data.folio,event_name:data.event_name,status_label:data.cleaned_at?'Evento finalizado':labels[data.status]||'Evento',invitation_url:!data.cleaned_at&&['active','draft'].includes(data.status)?data.invitation_url:null});
 }catch{return json({error:'No se pudo consultar el evento.'},503)}
};