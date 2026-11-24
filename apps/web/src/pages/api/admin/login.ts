import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
export const prerender=false;
const json=(data:object,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export const POST:APIRoute=async({request})=>{
 const username=import.meta.env.CAZAMI_ADMIN_USERNAME;
 const email=import.meta.env.CAZAMI_ADMIN_EMAIL;
 const url=import.meta.env.PUBLIC_SUPABASE_URL;
 const publishable=import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(!username||!email||!url||!publishable)return json({error:'Configuración del administrador pendiente.'},503);
 if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')return json({error:'Solicitud inválida.'},415);
 let input:{username?:unknown,password?:unknown};
 try{const text=await request.text();if(text.length>4096)return json({error:'Solicitud demasiado grande.'},413);input=JSON.parse(text)}catch{return json({error:'Solicitud inválida.'},400)}
 const suppliedUsername=typeof input.username==='string'?input.username.trim():'';
 const suppliedPassword=typeof input.password==='string'?input.password:'';
 if(suppliedUsername.length>120||suppliedPassword.length>1024||!suppliedUsername||!suppliedPassword||suppliedUsername.toLowerCase()!==username.toLowerCase())return json({error:'Usuario o contraseña incorrectos.'},401);
 try{
  const sb=createClient(url,publishable,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error}=await sb.auth.signInWithPassword({email,password:suppliedPassword});
  if(error||!data.session)return json({error:'Usuario o contraseña incorrectos.'},401);
  // Actual autorización: Supabase RLS + cazami_am_i_admin tras instalar la sesión.
  return json({access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return json({error:'Servicio de acceso temporalmente no disponible.'},503)}
};