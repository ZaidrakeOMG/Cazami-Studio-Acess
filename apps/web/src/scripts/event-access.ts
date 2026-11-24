import {BrowserQRCodeReader} from '@zxing/browser';
const folio=document.body.dataset.folio||'';
const el=(id:string)=>document.getElementById(id)!;
const btn=(id:string)=>el(id) as HTMLButtonElement;
const dlg=el('scanner') as HTMLDialogElement, video=el('video') as HTMLVideoElement;
const show=(id:string,yes=true)=>el(id).hidden=!yes;
const note=(s:string)=>el('notice').textContent=s;
type Pass={pass_number:number;family_name:string;max_people:number;used_people:number;status:string};
type Scan={status:string;family?:string;people?:number;message?:string};
let passes:Pass[]=[];let controls:{stop:()=>void}|null=null;let generation=0,busy=false,token='',requestKey='';
function render(){
 const total=passes.filter(p=>p.status==='active').reduce((n,p)=>n+p.max_people,0),entered=passes.reduce((n,p)=>n+p.used_people,0);
 el('total').textContent=String(total);el('entered').textContent=String(entered);el('remaining').textContent=String(Math.max(0,total-entered));
 const q=(el('search') as HTMLInputElement).value.trim().toLocaleLowerCase('es-MX');const list=el('list');list.replaceChildren();
 for(const p of passes.filter(p=>(p.family_name+' '+p.pass_number).toLocaleLowerCase('es-MX').includes(q))){
 const row=document.createElement('div');row.className='guest';const left=document.createElement('div'),name=document.createElement('b'),info=document.createElement('small'),state=document.createElement('span');
 name.textContent=p.family_name;info.textContent='Pase '+String(p.pass_number).padStart(3,'0')+' · '+p.max_people+' personas';left.append(name,info);state.className='state'+(p.used_people>=p.max_people?' done':'');state.textContent=p.status!=='active'?'Cancelado':p.used_people>=p.max_people?'Ingresó':p.used_people>0?p.used_people+'/'+p.max_people+' ingresaron':'Pendiente';const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=p.family_name.split(/\s+/).slice(0,2).map(x=>x.charAt(0).toUpperCase()).join('');left.className='guest-info';row.append(avatar,left,state);list.append(row);
 }if(!list.children.length){const p=document.createElement('p');p.textContent='No hay invitados en esta lista.';list.append(p);}
}
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
async function startCamera(){stop();busy=false;token='';requestKey='';show('result',false);show('camera');show('manual');el('hint').textContent='Coloca el QR dentro del recuadro.';const g=generation;try{const c=await new BrowserQRCodeReader().decodeFromConstraints({video:{facingMode:{ideal:'environment'}},audio:false},video,(r)=>{if(r&&g===generation&&!busy)void validate(r.getText())});if(g!==generation)c.stop();else controls=c}catch{if(g===generation)el('hint').textContent='No se pudo abrir la cámara. Revisa el permiso o introduce el código manualmente.'}}
function result(r:Scan){show('camera',false);show('manual',false);show('result');el('result').className=r.status;el('hint').textContent='';el('title').textContent=r.status==='allowed'?'ACCESO AUTORIZADO':r.status==='registered'?'ENTRADA REGISTRADA':r.status==='used'?'PASE YA UTILIZADO':'ACCESO DENEGADO';el('count').textContent=r.people?String(r.people)+' PERSONAS':'';el('family').textContent=r.family||'';el('detail').textContent=r.message||'';show('register',r.status==='allowed');show('next',r.status!=='allowed');btn('register').disabled=false;}
async function validate(value:string){if(busy)return;busy=true;stop();const g=generation;token=value.trim();requestKey=crypto.randomUUID();try{const data=await api('preview',{token});if(dlg.open&&g===generation)result(data as Scan)}catch{if(dlg.open&&g===generation)result({status:'denied',message:'No se pudo validar el pase. Verifica la conexión.'})}finally{if(g===generation)busy=false}}
btn('register').addEventListener('click',async()=>{if(busy||!token)return;busy=true;const g=generation;btn('register').disabled=true;try{const data=await api('register',{token,requestKey});if(dlg.open&&g===generation)result(data as Scan);await load()}catch{if(g===generation){el('detail').textContent='No se confirmó el registro. Intenta de nuevo.';btn('register').disabled=false}}finally{if(g===generation)busy=false}});
btn('scan').addEventListener('click',()=>{if(!dlg.open)dlg.showModal();void startCamera()});btn('next').addEventListener('click',()=>void startCamera());btn('close').addEventListener('click',()=>dlg.close());dlg.addEventListener('close',stop);el('manual').addEventListener('submit',e=>{e.preventDefault();void validate((el('manualCode') as HTMLInputElement).value)});el('search').addEventListener('input',render);btn('refresh').addEventListener('click',()=>void load());btn('exit').addEventListener('click',async()=>{stop();try{await api('logout');location.replace('/')}catch{note('No se pudo cerrar sesión. Intenta de nuevo.')}});window.addEventListener('pagehide',stop);void load();
