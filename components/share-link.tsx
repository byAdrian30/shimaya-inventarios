'use client';
import {useState} from 'react';
import {Copy,ShieldCheck} from 'lucide-react';
export default function ShareLink(){
 const [url,setUrl]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function copy(){
  setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/admin/share-link',{cache:'no-store'}),data=await response.json() as {url?:string;error?:string};
   if(!response.ok||!data.url)throw Error(data.error||'No se pudo obtener el enlace.');
   setUrl(data.url);
   try{await navigator.clipboard.writeText(data.url);setMessage('Enlace de administración de solo lectura copiado.')}catch{setMessage('Selecciona y copia el enlace de abajo.')}
  }catch(e){setMessage((e as Error).message)}finally{setBusy(false)}
 }
 return <section className="panel shared-link-card"><div><h2><ShieldCheck size={19}/>Administración · Solo lectura</h2><p>Quien tenga este enlace podrá consultar todos los apartados, incluidos costos y reportes, sin iniciar sesión. No podrá modificar datos.</p></div><button className="btn secondary" disabled={busy} onClick={copy}><Copy size={16}/>{busy?'Obteniendo enlace…':'Copiar enlace de solo lectura'}</button>{url&&<label className="field"><span>Enlace para compartir</span><input aria-label="Enlace de administración de solo lectura" readOnly value={url} onFocus={e=>e.currentTarget.select()}/></label>}{message&&<p role="status">{message}</p>}</section>;
}
