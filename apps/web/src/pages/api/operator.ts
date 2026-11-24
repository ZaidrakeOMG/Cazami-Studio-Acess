import type {APIRoute} from 'astro';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
export const prerender=false;
const json=(data:object,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export const POST:APIRoute=async({request,cookies})=>{
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return json({error:'Solicitud inválida'},403);
 let body:any;
 try{const raw=await request.text();if(raw.length>4096)return json({error:'Solicitud inválida'},413);body=JSON.parse(raw)}catch{return json({error:'Solicitud inválida'},400)}
 const folio=String(body?.folio||'').toUpperCase(),action=String(body?.action||'');
 if(!/^CA-[1-9][0-9]{0,10}$/.test(folio)||!['authorize','list','preview','register','logout'].includes(action))return json({error:'Solicitud inválida'},400);
 const name='cz_op_'+folio.replace('-','_'),opts={path:'/api/operator',httpOnly:true,secure:true,sameSite:'strict' as const,maxAge:30*86400};
 if(action==='logout'){cookies.delete(name,{path:opts.path});return json({status:'ok'})}
 const saved=cookies.get(name)?.value||'';
 const [storedCode,storedDevice]=saved.split('.');
 const code=action==='authorize'?String(body.code||'').trim().replace(/[-\s]/g,'').toUpperCase():storedCode;
 const device=action==='authorize'?randomUUID():storedDevice;
 if(!/^[0-9A-F]{16}$/.test(code||'')||!device)return json({status:'unauthorized',error:'Autoriza este dispositivo'},401);
 const url=import.meta.env.PUBLIC_SUPABASE_URL,secret=import.meta.env.SUPABASE_SECRET_KEY;
 if(!url||!secret)return json({error:'Servicio no configurado'},503);
 const token=typeof body.token==='string'?body.token:null;
 const key=typeof body.requestKey==='string'?body.requestKey:null;
 if(action==='register'&&(!key||!/^[0-9a-f-]{36}$/.test(key)))return json({error:'Solicitud inválida'},400);
 try{
 const sb=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
 const {data,error}=await sb.rpc('cazami_operator_access',{p_folio:folio,p_code:code,p_action:action==='authorize'?'list':action,p_token:token,p_request:key,p_device:device});
 if(error||!data)return json({error:'No se pudo consultar el evento'},503);
 if(data.status==='unauthorized'){cookies.delete(name,{path:opts.path});return json({status:'unauthorized',error:'Clave de acceso incorrecta o vencida'},401)}
 if(action==='authorize'&&data.status==='ok')cookies.set(name,code+'.'+device,opts);
 return json(data);
 }catch{return json({error:'Servicio temporalmente no disponible'},503)}
};