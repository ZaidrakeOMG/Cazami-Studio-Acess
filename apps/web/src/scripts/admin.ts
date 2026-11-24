import { createClient } from '@supabase/supabase-js';

const URL = import.meta.env.PUBLIC_SUPABASE_URL;
const KEY = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const $ = (id: string) => document.getElementById(id)!;
const sb = URL && KEY ? createClient(URL, KEY, {auth: {autoRefreshToken:true, persistSession:true,detectSessionInUrl:true,flowType:'implicit'}}) : null;
type EventRecord = {
  id:string;folio:string;event_name:string;client_name:string;event_type:string;invitation_url:string;
  event_date:string|null;status:string;max_passes:number;max_people:number;retention_days:number;
  historical_passes:number;historical_people:number;historical_entries:number;cleaned_at:string|null;
};
let events:EventRecord[]=[];
let currentTab='events';
let sessionRefresh=0;
const statusNames:Record<string,string>={draft:'Preparación',active:'Activa',paused:'Suspendida',finished:'Finalizada'};
const show=(id:string, visible=true)=>$(id).classList.toggle('hidden',!visible);
function message(id:string,txt:string,type:'success'|'error'|'info'='info') {
  const el=$(id);el.textContent=txt;el.classList.remove('hidden','success','error');
  if(type!=='info')el.classList.add(type);
}
function clearMessage(id:string){show(id,false)}
function safe(s:unknown):string{return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'} as Record<string,string>)[c]??c)}
function safeLink(s:string):string{try{const u=new globalThis.URL(s);return u.protocol==='https:'?u.href:'#'}catch{return '#'}}
function dateText(s:string|null){if(!s)return 'Fecha pendiente';const [y,m,d]=s.split('-').map(Number);return new Intl.DateTimeFormat('es-MX',{day:'numeric',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12));}
function localToday(){const date=new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return [parts.find(x=>x.type==='year')?.value,parts.find(x=>x.type==='month')?.value,parts.find(x=>x.type==='day')?.value].join('-')}
function parseForm(form:HTMLFormElement){const f=new FormData(form);const text=(k:string)=>String(f.get(k)??'').trim();const url=text('invitation_url');let parsed:globalThis.URL;
  try{parsed=new globalThis.URL(url);if(parsed.protocol!=='https:')throw Error('HTTPS requerido')}catch{throw Error('La invitación debe tener una dirección HTTPS válida.')}
  const event_date=text('event_date')||null;
  return {event_name:text('event_name'),client_name:text('client_name'),event_type:text('event_type'),invitation_url:parsed.href,event_date,max_passes:Number(text('max_passes')),max_people:Number(text('max_people')),retention_days:Number(text('retention_days'))};
}
async function authState(){
 if(!sb)return;
 const order=++sessionRefresh;
 const {data:{session},error}=await sb.auth.getSession();
 if(order!==sessionRefresh)return;
 if(error || !session){show('dashboard',false);show('authScreen');return;}
 const {data:allowed,error:permissionError}=await sb.rpc('cazami_am_i_admin');
 if(order!==sessionRefresh)return;
 if(permissionError || allowed!==true){
  show('dashboard',false);show('authScreen');
  message('authMessage','Esta cuenta todavía no está autorizada. Comprueba que verificaste el correo del administrador.','error');
  return;
 }
 show('authScreen',false);show('dashboard');
 $('userEmail').textContent=session.user.email??'Cuenta autorizada';
 await reload();
}
async function reload(){
 if(!sb)return;
 const {data,error}=await sb.from('cazami_events').select('id,folio,event_name,client_name,event_type,invitation_url,event_date,status,max_passes,max_people,retention_days,historical_passes,historical_people,historical_entries,cleaned_at').order('created_at',{ascending:false});
 if(error){message('dashboardMessage','Error al consultar eventos: '+error.message,'error');return;}
 events=(data??[]) as EventRecord[];
 clearMessage('dashboardMessage');
 render();
}
function badge(e:EventRecord){
 const clazz=e.cleaned_at?'finished':e.status;
 return '<span class="event-status '+safe(clazz)+'">'+(e.cleaned_at?'Pases depurados':safe(statusNames[e.status]??e.status))+'</span>';
}
function item(e:EventRecord,historical=false){
 const isPast=!!(e.event_date && e.event_date<localToday());
 const canClean=isPast&&!e.cleaned_at;
 const cleaned=!!e.cleaned_at;
 const canEdit=!cleaned;
 return '<article class="event-card">'+
 '<div class="event-main"><div><div class="event-title">'+safe(e.event_name)+'</div><div class="event-client">'+safe(e.client_name||e.event_type)+'</div></div><span class="folio-chip">'+safe(e.folio)+'</span></div>'+
 '<div class="event-meta">'+badge(e)+'<span>'+safe(dateText(e.event_date))+'</span><span>· '+safe(String(e.max_people))+' invitados máx.</span></div>'+
 '<div class="event-link"><span>↗</span><a href="'+safe(safeLink(e.invitation_url))+'" target="_blank" rel="noopener noreferrer" title="Abrir invitación">'+safe(e.invitation_url)+'</a></div>'+
 (historical?'<p class="helper-text">Pases históricos: '+(e.historical_passes||0)+' · Personas: '+(e.historical_people||0)+' · Entradas: '+(e.historical_entries||0)+(cleaned?' · Depurados':'')+'</p>':'')+
 '<div class="event-actions">'+(canEdit?'<button class="action" data-action="edit" data-id="'+safe(e.id)+'" type="button">Editar</button>':'')+
 (canEdit&&e.status!=='finished'?'<button class="action" data-action="finish" data-id="'+safe(e.id)+'" type="button">Finalizar</button>':'')+
 (canClean?'<button class="action warn" data-action="clean" data-id="'+safe(e.id)+'" type="button">Depurar pases</button>':'')+
 (cleaned?'<span class="action" style="text-align:center;cursor:default">Folio conservado</span>':'')+
 '</div></article>';
}
function render(){
 $('statAll').textContent=String(events.length);
 $('statActive').textContent=String(events.filter(e=>e.status==='active').length);
 $('statArchived').textContent=String(events.filter(e=>e.status==='finished'||e.cleaned_at).length);
 const term=($('searchEvents') as HTMLInputElement).value.toLocaleLowerCase('es-MX').trim();
 const matched=events.filter(e=>(e.folio+' '+e.event_name+' '+e.client_name+' '+e.invitation_url).toLocaleLowerCase('es-MX').includes(term));
 $('listCount').textContent=matched.length+' '+(matched.length===1?'fiesta':'fiestas');
 $('eventList').innerHTML=matched.length?matched.map(e=>item(e)).join(''):'<p class="empty-msg">Aún no hay fiestas con esa búsqueda.</p>';
 const historic=events.filter(e=>e.status==='finished'||!!e.cleaned_at);
 $('historicalList').innerHTML=historic.length?historic.map(e=>item(e,true)).join(''):'<p class="empty-msg">Todavía no existen eventos finalizados.</p>';
}
function changeTab(tab:string){
 currentTab=tab;
 for(const t of ['events','history','settings']){$('tab'+t[0].toUpperCase()+t.slice(1)).classList.toggle('hidden',t!==tab);}
 document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
 window.scrollTo({top:0,behavior:'smooth'});
}
function openEditor(id:string){
 const e=events.find(x=>x.id===id);if(!e||e.cleaned_at)return;
 const f=$('editEventForm') as HTMLFormElement;
 for(const name of ['id','event_name','client_name','event_type','invitation_url','status','max_passes','max_people','retention_days']){
  (f.elements.namedItem(name) as HTMLInputElement|HTMLSelectElement).value=String((e as unknown as Record<string,unknown>)[name]??'');
 }
 (f.elements.namedItem('event_date') as HTMLInputElement).value=e.event_date??'';
 $('dialogFolio').textContent=e.folio;
 ($('editDialog') as HTMLDialogElement).showModal();
}
async function doAction(action:string,id:string){
 const e=events.find(x=>x.id===id);if(!e||!sb)return;
 if(action==='edit'){openEditor(id);return}
 if(action==='finish'){
  if(!window.confirm('¿Marcar '+e.folio+' como finalizada? Podrás consultar su historial.'))return;
  const {error}=await sb.from('cazami_events').update({status:'finished'}).eq('id',id);
  if(error)message('dashboardMessage',error.message,'error');
  else {message('dashboardMessage',e.folio+' finalizada.','success');await reload()}
 }
 if(action==='clean'){
  if(!e.event_date || e.event_date>=localToday()){message('dashboardMessage','Solo se permite depurar después de la fecha de la fiesta.','error');return;}
  const typed=window.prompt('Esto eliminará los pases asociados a '+e.folio+' de forma irreversible, conservando el folio y los totales. Escribe '+e.folio+' para confirmar:');
  if(typed!==e.folio)return;
  const {data,error}=await sb.rpc('cazami_purge_event',{p_event_id:id});
  if(error)message('dashboardMessage','No se pudo depurar: '+error.message,'error');
  else {message('dashboardMessage',e.folio+': '+String(data?.passes_deleted??0)+' pases depurados. Se conservó el historial.','success');await reload()}
 }
}
function connect(){
 const login=$('loginForm') as HTMLFormElement;
 login.addEventListener('submit',async(ev)=>{
  ev.preventDefault();if(!sb)return;
  const email=($('loginEmail') as HTMLInputElement).value.trim();
  const password=($('loginPassword') as HTMLInputElement).value;
  const btn=$('loginButton') as HTMLButtonElement;btn.disabled=true;btn.textContent='Validando acceso...';
  const {error}=await sb.auth.signInWithPassword({email,password});
  btn.disabled=false;btn.textContent='Iniciar sesión →';
  if(error)message('authMessage','No se pudo iniciar sesión. Si es tu primer acceso, solicita un enlace por correo.','error');
  else {clearMessage('authMessage');await authState()}
 });
 $('magicLinkButton').addEventListener('click',async()=>{
  if(!sb)return;
  const email=($('loginEmail') as HTMLInputElement).value.trim().toLowerCase();
  if(!email){message('authMessage','Escribe tu correo primero para recibir el enlace de acceso.','error');return;}
  const btn=$('magicLinkButton') as HTMLButtonElement;btn.disabled=true;
  const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:window.location.origin+'/admin'}});
  btn.disabled=false;
  if(error)message('authMessage',error.message,'error');
  else message('authMessage','Si el correo está autorizado y el servicio de email está configurado, recibirás un enlace para entrar. Revísalo en tu bandeja de entrada.','success');
 });
 $('signOut').addEventListener('click',async()=>{if(!sb)return;await sb.auth.signOut();events=[];await authState()});
 $('refresh').addEventListener('click',()=>void reload());
 $('searchEvents').addEventListener('input',render);
 document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.addEventListener('click',()=>changeTab(b.dataset.tab||'events')));
 $('createEventForm').addEventListener('submit',async(ev)=>{
  ev.preventDefault();if(!sb)return;
  const f=ev.currentTarget as HTMLFormElement,btn=$('createButton') as HTMLButtonElement;
  try{
   const obj=parseForm(f);
   btn.disabled=true;btn.textContent='Creando fiesta...';
   const {data,error}=await sb.from('cazami_events').insert(obj).select('folio').single();
   if(error)throw error;
   f.reset();message('dashboardMessage','Fiesta registrada correctamente. Folio asignado: '+data.folio,'success');
   await reload();changeTab('events');
  }catch(error){message('dashboardMessage',error instanceof Error?error.message:String(error),'error');window.scrollTo({top:0,behavior:'smooth'});}
  finally{btn.disabled=false;btn.textContent='Crear fiesta y asignar folio →'}
 });
 for(const list of ['eventList','historicalList']){
  $(list).addEventListener('click',(ev)=>{
   const el=(ev.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');if(!el)return;
   void doAction(el.dataset.action??'',el.dataset.id??'');
  })
 }
 $('editEventForm').addEventListener('submit',async ev=>{
  ev.preventDefault();if(!sb)return;
  const f=ev.currentTarget as HTMLFormElement,id=String(new FormData(f).get('id')||'');
  try{
   const updates={...parseForm(f),status:String(new FormData(f).get('status'))};
   const {error}=await sb.from('cazami_events').update(updates).eq('id',id);
   if(error)throw error;
   ($('editDialog') as HTMLDialogElement).close();await reload();
   message('dashboardMessage','Cambios guardados correctamente.','success');
  }catch(e){window.alert('No se pudo actualizar: '+(e instanceof Error?e.message:String(e)));}
 });
 document.querySelector('.close-dialog')?.addEventListener('click',()=>($('editDialog') as HTMLDialogElement).close());
 $('passwordForm').addEventListener('submit',async ev=>{
  ev.preventDefault();if(!sb)return;
  const f=ev.currentTarget as HTMLFormElement,p=String(new FormData(f).get('password')||'');
  if(p.length<12){message('dashboardMessage','Usa una contraseña de al menos 12 caracteres.','error');return}
  const {error}=await sb.auth.updateUser({password:p});
  if(error)message('dashboardMessage','No se guardó la contraseña: '+error.message,'error');
  else {f.reset();message('dashboardMessage','Contraseña actualizada correctamente.','success');changeTab('settings')}
 });
}
async function start(){
 if(!sb){show('bootScreen',false);show('authScreen');message('authMessage','No se configuraron PUBLIC_SUPABASE_URL y PUBLIC_SUPABASE_PUBLISHABLE_KEY en Vercel.','error');return}
 connect();
 sb.auth.onAuthStateChange(()=>{setTimeout(()=>{void authState()},0)});
 await authState();
 show('bootScreen',false);
}
void start();