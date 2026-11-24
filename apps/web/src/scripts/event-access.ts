import {BrowserQRCodeReader} from '@zxing/browser';
const folio=document.body.dataset.folio||'';
const el=(id:string)=>document.getElementById(id)!;
const btn=(id:string)=>el(id) as HTMLButtonElement;
const dlg=el('scanner') as HTMLDialogElement, video=el('video') as HTMLVideoElement;
const show=(id:string,yes=true)=>el(id).hidden=!yes;
const note=(s:string)=>el('notice').textContent=s;
type Pass={pass_number:number;family_name:string;max_people:number;used_people:number;status:string};
type Scan={status:string;family?:string;people?:number;message?:string;max_people?:number;used_people?:number;remaining?:number};
let passes:Pass[]=[];let controls:{stop:()=>void}|null=null;let generation=0,busy=false,token='',requestKey='';
let available=0,pendingCount:number|null=null;
const qty=el('peopleNow') as HTMLInputElement;
function quantityState(){const n=Number(qty.value),valid=qty.value!==''&&Number.isInteger(n)&&n>=1&&n<=available;btn('register').disabled=busy||!valid;qty.disabled=pendingCount!==null;btn('minus').disabled=pendingCount!==null||n<=1;btn('plus').disabled=pendingCount!==null||n>=available;el('quantityHint').textContent='Máximo disponible: '+available+(valid?'':qty.value?' · Ingresa un número válido':'');}
let guestFilter='all';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es-MX');
function render(){
 const active=passes.filter(p=>p.status==='active');
 const total=active.reduce((n,p)=>n+p.max_people,0),entered=passes.reduce((n,p)=>n+p.used_people,0),remaining=active.reduce((n,p)=>n+Math.max(0,p.max_people-p.used_people),0);
 el('total').textContent=String(total);el('entered').textContent=String(entered);el('remaining').textContent=String(remaining);
 const q=normalize((el('search') as HTMLInputElement).value.trim());const list=el('list');list.replaceChildren();
 const filtered=passes.filter(p=>{
  if(!normalize(p.family_name+' '+p.pass_number+' '+String(p.pass_number).padStart(3,'0')).includes(q))return false;
  if(guestFilter==='available')return p.status==='active'&&p.used_people<p.max_people;
  if(guestFilter==='complete')return p.status==='active'&&p.used_people>=p.max_people;
  return true;
 });
 el('guestCount').textContent=filtered.length+' de '+passes.length+(passes.length===1?' pase':' pases');
 for(const p of filtered){
  const canceled=p.status!=='active',remaining=Math.max(0,p.max_people-p.used_people),available=canceled?0:remaining;
  const kind=canceled?'cancelled':remaining===0?'complete':p.used_people>0?'partial':'pending';
  const row=document.createElement('article');row.className='guest guest-'+kind;
  const avatar=document.createElement('span');avatar.className='avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=p.family_name.trim().split(/\s+/).slice(0,2).map(x=>x.charAt(0).toUpperCase()).join('');
  const left=document.createElement('div');left.className='guest-info';
  const name=document.createElement('b');name.textContent=p.family_name;
  const info=document.createElement('small');info.textContent='Pase '+String(p.pass_number).padStart(3,'0')+' · '+p.used_people+' de '+p.max_people+' ingresaron';
  const progress=document.createElement('div');progress.className='guest-progress';progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','Personas que ingresaron');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(p.max_people));progress.setAttribute('aria-valuenow',String(p.used_people));
  const fill=document.createElement('span');fill.style.width=String(Math.min(100,p.used_people/Math.max(1,p.max_people)*100))+'%';progress.append(fill);left.append(name,info,progress);
  const right=document.createElement('div');right.className='guest-capacity';
  const capacity=document.createElement('strong');capacity.className='capacity-value';capacity.textContent=available+'/'+p.max_people;
  const label=document.createElement('small');label.className='capacity-label';label.textContent='Disponibles';
  const state=document.createElement('span');state.className='guest-state';state.textContent=canceled?'Cancelado':remaining===0?'Completo':p.used_people>0?'Parcial':'Pendiente';
  right.append(capacity,label,state);row.append(avatar,left,right);list.append(row);
 }
 if(!list.children.length){const empty=document.createElement('div');empty.className='guest-empty';empty.textContent=passes.length?'No hay pases que coincidan.':'Todavía no hay invitados registrados.';list.append(empty);}
}
document.querySelectorAll<HTMLButtonElement>('[data-guest-filter]').forEach(button=>button.addEventListener('click',()=>{
 guestFilter=button.dataset.guestFilter||'all';
 document.querySelectorAll<HTMLButtonElement>('[data-guest-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 render();
}));
async function api(action:string,extra:Record<string,unknown>={}){
 const response=await fetch('/api/operator',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({folio,action,...extra})});
 const data=await response.json();
 if(!response.ok)throw Error(data.error||'No se pudo conectar');
 return data;
}
function present(data:any){
 if(data.status!=='ok'){show('panel',false);note(data.message||'El evento no está disponible.');return;}
 el('name').textContent=data.event_name;passes=(data.passes||[]) as Pass[];show('exit');show('panel');render();
 btn('scan').disabled=!data.active;note(data.active?'Evento activo · Control de entradas':'Evento inactivo. Puedes consultar la lista; activa la fiesta desde administración para registrar entradas.');
}
async function load(){try{present(await api('list'))}catch(e){note(e instanceof Error?e.message:'No se pudo cargar la lista de invitados.')}}
function stop(){generation++;try{controls?.stop()}catch{}controls=null;try{(video.srcObject as MediaStream|null)?.getTracks().forEach(t=>t.stop());video.srcObject=null}catch{}}
async function startCamera(){stop();busy=false;token='';requestKey='';pendingCount=null;available=0;qty.value='';show('quantityBox',false);show('passProgress',false);show('result',false);show('camera');show('manual');el('hint').textContent='Coloca el QR dentro del recuadro.';const g=generation;try{const c=await new BrowserQRCodeReader().decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video,(r)=>{if(r&&g===generation&&!busy)void validate(r.getText())});if(g!==generation)c.stop();else controls=c}catch{if(g===generation)el('hint').textContent='No se pudo abrir la cámara. Revisa el permiso o introduce el código manualmente.'}}
function result(r:Scan){
 show('camera',false);show('manual',false);show('result');
 const editable=r.status==='allowed'||r.status==='quantity_error';
 const remaining=Number(r.remaining??0);
 el('result').className=editable?'allowed':r.status;
 el('hint').textContent='';
 el('title').textContent=editable?'QR ESCANEADO CORRECTAMENTE':r.status==='registered'?'ENTRADA REGISTRADA':r.status==='used'?'PASE COMPLETO':'ACCESO DENEGADO';
 el('count').textContent=editable?remaining+' DISPONIBLES':r.status==='registered'?String(r.people??0)+' REGISTRADOS':r.status==='used'?'SIN LUGARES':'';
 el('family').textContent=r.family||'';
 el('detail').textContent=r.message||(r.status==='registered'?(remaining>0?'Pase parcial: aún pueden ingresar '+remaining+' personas.':'Pase completo. No admite más entradas.'):'');
 show('passProgress',typeof r.max_people==='number');
 el('passMax').textContent=String(r.max_people??0);el('passUsed').textContent=String(r.used_people??0);el('passRemaining').textContent=String(remaining);
 show('quantityBox',editable);show('register',editable);show('next',!editable);
 pendingCount=null;available=remaining;qty.max=String(remaining);qty.value=remaining===1?'1':'';btn('register').textContent='Aceptar y registrar';quantityState();
}
qty.addEventListener('input',quantityState);
btn('minus').addEventListener('click',()=>{qty.value=String(Math.max(1,Number(qty.value||1)-1));quantityState()});
btn('plus').addEventListener('click',()=>{qty.value=String(Math.min(available,Number(qty.value||0)+1));quantityState()});
async function validate(value:string){if(busy)return;busy=true;stop();const g=generation;token=value.trim();requestKey=crypto.randomUUID();try{const data=await api('preview',{token});if(dlg.open&&g===generation)result(data as Scan)}catch{if(dlg.open&&g===generation)result({status:'denied',message:'No se pudo validar el pase. Verifica la conexión.'})}finally{if(g===generation){busy=false;quantityState()}}}
btn('register').addEventListener('click',async()=>{
 if(busy||!token)return;
 const people=pendingCount??Number(qty.value);
 if(!Number.isInteger(people)||people<1||people>available){quantityState();return}
 busy=true;pendingCount=people;quantityState();const g=generation;
 try{
  const data=await api('register',{token,requestKey,people});
  if(dlg.open&&g===generation){if(data.status==='quantity_error')requestKey=crypto.randomUUID();result(data as Scan)}
  await load();
 }catch{
  if(g===generation){el('detail').textContent='No se confirmó el registro. Reintenta con la misma cantidad para evitar duplicados.';btn('register').textContent='Reintentar registro';}
 }finally{if(g===generation){busy=false;quantityState()}}
});

btn('scan').addEventListener('click',()=>{if(!dlg.open)dlg.showModal();void startCamera()});btn('next').addEventListener('click',()=>void startCamera());btn('close').addEventListener('click',()=>dlg.close());dlg.addEventListener('close',stop);el('manual').addEventListener('submit',e=>{e.preventDefault();void validate((el('manualCode') as HTMLInputElement).value)});el('search').addEventListener('input',render);btn('refresh').addEventListener('click',()=>void load());btn('exit').addEventListener('click',async()=>{stop();try{await api('logout');location.replace('/')}catch{note('No se pudo cerrar sesión. Intenta de nuevo.')}});window.addEventListener('pagehide',stop);void load();
