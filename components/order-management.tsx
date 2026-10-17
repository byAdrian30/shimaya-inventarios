'use client';
import {useEffect,useState} from 'react';
import {AlertTriangle,ClipboardList,Search,Trash2,X} from 'lucide-react';
import {convert,normalize,type State} from '../lib/inventory';
import {orderRestocks,requestStatus} from '../lib/requests';
import {RequestDetails} from './requests-dashboard';

const fmt=(n:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:4}).format(n);
type Props={state:State;busy:boolean;save:(action:any)=>Promise<boolean>};

export default function OrderManagement({state,busy,save}:Props){
 const [query,setQuery]=useState(''),[area,setArea]=useState(''),[view,setView]=useState('activas'),[page,setPage]=useState(1);
 const [selectedId,setSelectedId]=useState(''),[deleting,setDeleting]=useState(false),[note,setNote]=useState(''),[checked,setChecked]=useState(false);
 const requests=state.requests||[],areas=[...new Set(requests.map(r=>r.area))];
 const visible=requests.filter(r=>{
  const matchesView=view==='todas'||(view==='eliminadas'?!!r.deleted:!r.deleted&&(view==='activas'||view==='pendientes'&&!r.closed||view==='cerradas'&&r.closed));
  return matchesView&&(!area||r.area===area)&&normalize([r.number,r.area,r.requester,...r.lines.map(l=>l.name)].join(' ')).includes(normalize(query));
 });
 const pages=Math.max(1,Math.ceil(visible.length/20)),currentPage=Math.min(page,pages),rows=visible.slice((currentPage-1)*20,currentPage*20);
 const selected=requests.find(r=>r.id===selectedId);
 useEffect(()=>setPage(1),[query,area,view]);
 useEffect(()=>{if(!selectedId||busy)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setSelectedId('')};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close)},[selectedId,busy]);
 function open(id:string,remove=false){setSelectedId(id);setDeleting(remove);setNote('');setChecked(false)}
 let restocks:ReturnType<typeof orderRestocks>=[],issue='';
 if(selected&&deleting&&!selected.deleted){try{restocks=orderRestocks(state,selected,convert)}catch(e){issue=(e as Error).message}}
 async function remove(){if(!selected||!checked||issue||busy)return;if(await save({type:'eliminar-orden',requestId:selected.id,note}))setSelectedId('')}

 return <>
  <div className="hint"><ClipboardList size={18}/><p>Solo administración puede eliminar órdenes. Si una orden tuvo despachos, se devuelve al inventario lo descontado que aún no haya sido revertido. La eliminación queda registrada en el historial.</p></div>
  <div className="toolbar">
   <div className="search"><Search size={17}/><input aria-label="Buscar orden de despacho" placeholder="Buscar orden, solicitante o insumo…" value={query} onChange={e=>setQuery(e.target.value)}/></div>
   <select aria-label="Área de las órdenes" value={area} onChange={e=>setArea(e.target.value)}><option value="">Todas las áreas</option>{areas.map(a=><option key={a}>{a}</option>)}</select>
   <select aria-label="Estado de las órdenes" value={view} onChange={e=>setView(e.target.value)}><option value="activas">Órdenes sin eliminar</option><option value="pendientes">Pendientes y parciales</option><option value="cerradas">Cerradas</option><option value="eliminadas">Eliminadas</option><option value="todas">Todas</option></select>
  </div>
  <section className="panel">
   <div className="section-title"><div><h2>Órdenes de despacho</h2><p>{requests.filter(r=>!r.deleted).length} sin eliminar · {requests.filter(r=>r.deleted).length} eliminadas</p></div><span className="badge">{visible.length} en esta vista</span></div>
   {rows.length?<div className="table-wrap"><table><thead><tr><th scope="col">ORDEN / FECHA</th><th scope="col">ÁREA</th><th scope="col">SOLICITADO POR</th><th scope="col">INSUMOS</th><th scope="col">ESTADO</th><th scope="col">ACCIONES</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}>
    <td data-label="Orden / fecha"><strong>{r.number}</strong><small>{r.date}</small></td><td data-label="Área">{r.area}</td><td data-label="Solicitado por">{r.requester}</td><td data-label="Insumos">{r.lines.length}</td>
    <td data-label="Estado"><span className={'status '+(r.deleted?'low':r.closed?'neutral':'ok')}>{requestStatus(r)}</span>{r.deleted&&<small>Por {r.deleted.by} · {r.deleted.date}</small>}</td>
    <td data-label="Acciones"><div className="order-actions"><button className="text-btn" disabled={busy} onClick={()=>open(r.id)}>Ver detalle</button>{!r.deleted&&<button className="text-btn red" disabled={busy} aria-label={'Eliminar orden '+r.number} onClick={()=>open(r.id,true)}><Trash2 size={16}/>Eliminar</button>}</div></td>
   </tr>)}</tbody></table></div>:<div className="request-empty"><ClipboardList size={30}/><h3>No hay órdenes en esta vista</h3><p>Los pedidos enviados aparecerán aquí.</p></div>}
   {visible.length>20&&<div className="table-footer"><span>Página {currentPage} de {pages}</span><button className="text-btn" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Anterior</button><button className="text-btn" disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Siguiente</button></div>}
  </section>
  {selected&&<div className="modal-backdrop"><section className="modal wide" role="dialog" aria-modal="true" aria-label={(deleting?'Eliminar orden ':'Detalle de la orden ')+selected.number}>
   <div className="section-title"><div><h2>{deleting?'Eliminar ':''}{selected.number} · {selected.area}</h2><p>{selected.requester} · Pedido del {selected.date}</p></div><button className="icon-btn" autoFocus disabled={busy} aria-label="Cerrar detalle de la orden" onClick={()=>setSelectedId('')}><X size={20}/></button></div>
   <RequestDetails r={selected}/>
   {deleting&&!selected.deleted&&<>
    <div className="hint order-delete-warning"><AlertTriangle size={18}/><p>Esta orden saldrá de Pedido y Despacho. {restocks.length?'Al confirmar, se devolverán al stock las cantidades indicadas abajo.':'Si no tuvo entregas pendientes de revertir, el stock no cambia.'} Puedes consultar el registro en la vista Eliminadas.</p></div>
    {!!restocks.length&&<div className="order-restocks"><h3>Stock que se devolverá</h3>{restocks.map(l=><div key={l.ingredientId}><span>{l.name}</span><strong>+{fmt(l.quantity)} {l.unit}</strong></div>)}</div>}
    {issue&&<div className="error" role="alert">{issue}</div>}
    <label className="field"><span>Motivo de eliminación (opcional)</span><textarea rows={2} maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ej. Pedido duplicado o ingresado por error"/></label>
    <label className="confirm-check"><input type="checkbox" disabled={busy||!!issue} checked={checked} onChange={e=>setChecked(e.target.checked)}/>Confirmo eliminar {selected.number}{restocks.length?' y devolver al stock las cantidades indicadas':''}.</label>
   </>}
   <div className="modal-footer"><button className="btn secondary" disabled={busy} onClick={()=>setSelectedId('')}>{deleting?'Cancelar':'Cerrar'}</button>{deleting&&!selected.deleted&&<button className="btn" disabled={busy||!checked||!!issue} onClick={remove}><Trash2 size={16}/>{busy?'Eliminando…':'Eliminar orden'}</button>}</div>
  </section></div>}
 </>;
}
