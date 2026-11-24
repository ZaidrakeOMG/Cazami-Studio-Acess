import {createClient} from '@supabase/supabase-js';
import {BrowserQRCodeReader} from '@zxing/browser';
const sb=createClient(import.meta.env.PUBLIC_SUPABASE_URL,import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
const folio=document.body.dataset.folio||'';
const el=(id:string)=>document.getElementById(id)!;
const btn=(id:string)=>el(id) as HTMLButtonElement;
const dlg=el('scanner') as HTMLDialogElement, video=el('video') as HTMLVideoElement;
const show=(id:string,yes=true)=>el(id).hidden=!yes;
const note=(s:string)=>el('notice').textContent=s;
type Pass={id:string;pass_number:number;family_name:string;max_people:number;used_people:number;status:string};
type Scan={status:string;family?:string;people?:number;message?:string};
let passes:Pass[]=[];let controls:{stop:()=>void}|null=null;let generation=0,busy=false,token='',requestKey='';
function render(){
 const total=passes.filter(p=>p.status==='active').reduce((n,p)=>n+p.max_people,0),entered=passes.reduce((n,p)=>n+p.used_people,0);
 el('total').textContent=String(total);el('entered').textContent=String(entered);el('remaining').textContent=String(Math.max(0,total-entered));
 const q=(el('search') as HTMLInputElement).value.trim().toLocaleLowerCase('es-MX');const list=el('list');list.replaceChildren();
 for(const p of passes.filter(p=>(p.family_name+' '+p.pass_number).toLocaleLowerCase('es-MX').includes(q))){
 const row=document.createElement('div');row.className='guest';const left=document.createElement('div'),name=document.createElement('b'),info=document.createElement('small'),state=document.createElement('span');
 name.textContent=p.family_name;info.textContent='Pase '+String(p.pass_number).padStart(3,'0')+' · '+p.max_people+' personas';left.append(name,info);state.className='state'+(p.used_people>=p.max_people?' done':'');state.textContent=p.status!=='active'?'Cancelado':p.used_people>=p.max_people?'Ingresó':p.used_people>0?p.used_people+'/'+p.max_people+' ingresaron':'Pendiente';row.append(left,state);list.append(row);
 }if(!list.children.length){const p=document.createElement('p');p.textContent='No hay invitados en esta lista.';list.append(p);}
}
async function load(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session){show('login');show('panel',false);show('exit',false);note('Autoriza este dispositivo para consultar los pases.');return}
 const {data:admin,error:authError}=await sb.rpc('cazami_am_i_admin');
 if(authError||admin!==true){show('login');show('panel',false);show('exit');note('Esta cuenta no tiene permisos.');return}
 const {data:e,error}=await sb.from('cazami_events').select('id,event_name,status,cleaned_at,expires_on,timezone').eq('folio',folio).maybeSingle();
 if(error||!e){note('No se pudo consultar esta fiesta.');show('panel',false);return}
 el('name').textContent=e.event_name;
 const {data,error:passError}=await sb.from('cazami_passes').select('id,pass_number,family_name,max_people,used_people,status').eq('event_id',e.id).order('pass_number');
 if(passError){note('No se pudo cargar la lista de invitados.');return}
 passes=(data||[]) as Pass[];show('login',false);show('exit');show('panel');render();
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:e.timezone||'America/Monterrey',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const today=['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-');
 const active=e.status==='active'&&!e.cleaned_at&&(!e.expires_on||e.expires_on>today);btn('scan').disabled=!active;note(active?'Evento activo · Control de entradas':'Evento inactivo o caducado. Actívalo desde administración si corresponde.');
}
el('auth').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget as HTMLFormElement,d=new FormData(f),b=f.querySelector('button')!;b.disabled=true;try{const r=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:d.get('username'),password:d.get('password')})});const x=await r.json();if(!r.ok||!x.access_token)throw Error(x.error||'No se pudo iniciar sesión');const {error}=await sb.auth.setSession({access_token:x.access_token,refresh_token:x.refresh_token});if(error)throw error;f.reset();await load()}catch(x){note(x instanceof Error?x.message:'Error de acceso')}finally{b.disabled=false}});
function stop(){generation++;try{controls?.stop()}catch{}controls=null;try{(video.srcObject as MediaStream|null)?.getTracks().forEach(t=>t.stop());video.srcObject=null}catch{}}
async function startCamera(){stop();busy=false;token='';requestKey='';show('result',false);show('camera');show('manual');el('hint').textContent='Coloca el QR dentro del recuadro.';const g=generation;try{const c=await new BrowserQRCodeReader().decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video,(r)=>{if(r&&g===generation&&!busy)void validate(r.getText())});if(g!==generation)c.stop();else controls=c}catch{if(g===generation)el('hint').textContent='No se pudo abrir la cámara. Revisa el permiso o introduce el código manualmente.'}}
function result(r:Scan){show('camera',false);show('manual',false);show('result');el('result').className=r.status;el('hint').textContent='';el('title').textContent=r.status==='allowed'?'ACCESO AUTORIZADO':r.status==='registered'?'ENTRADA REGISTRADA':r.status==='used'?'PASE YA UTILIZADO':'ACCESO DENEGADO';el('count').textContent=r.people?String(r.people)+' PERSONAS':'';el('family').textContent=r.family||'';el('detail').textContent=r.message||'';show('register',r.status==='allowed');show('next',r.status!=='allowed');btn('register').disabled=false;}
async function validate(value:string){if(busy)return;busy=true;stop();const g=generation;token=value.trim();requestKey=crypto.randomUUID();try{const {data,error}=await sb.rpc('cazami_scan_pass',{p_folio:folio,p_token:token,p_request:null});if(error)throw error;if(dlg.open&&g===generation)result(data as Scan)}catch{if(dlg.open&&g===generation)result({status:'denied',message:'No se pudo validar el pase. Verifica la conexión.'})}finally{if(g===generation)busy=false}}
btn('register').addEventListener('click',async()=>{if(busy||!token)return;busy=true;const g=generation;btn('register').disabled=true;try{const {data,error}=await sb.rpc('cazami_scan_pass',{p_folio:folio,p_token:token,p_request:requestKey});if(error)throw error;if(dlg.open&&g===generation)result(data as Scan);await load()}catch{if(g===generation){el('detail').textContent='No se confirmó el registro. Intenta de nuevo.';btn('register').disabled=false}}finally{if(g===generation)busy=false}});
btn('scan').addEventListener('click',()=>{if(!dlg.open)dlg.showModal();void startCamera()});btn('next').addEventListener('click',()=>void startCamera());btn('close').addEventListener('click',()=>dlg.close());dlg.addEventListener('close',stop);el('manual').addEventListener('submit',e=>{e.preventDefault();void validate((el('manualCode') as HTMLInputElement).value)});el('search').addEventListener('input',render);btn('refresh').addEventListener('click',()=>void load());btn('exit').addEventListener('click',async()=>{stop();const {error}=await sb.auth.signOut({scope:'local'});if(error)note('No se pudo cerrar sesión.');else location.replace('/')});window.addEventListener('pagehide',stop);void load();
