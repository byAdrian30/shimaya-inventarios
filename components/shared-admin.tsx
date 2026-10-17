'use client';
import {useEffect,useState} from 'react';
import {Boxes,CalendarDays,ClipboardList,Coins,Download,History,LayoutDashboard,List,LoaderCircle,PackageCheck,PackagePlus,RefreshCw,Search,ShieldCheck,Users} from 'lucide-react';
import InventoryDashboard from './inventory-dashboard';
import DailyActivity from './daily-activity';
import ValuationDashboard,{ValuationSummary,soles} from './valuation-dashboard';
import {RequestDetails} from './requests-dashboard';
import {configured,normalize,type State,type Movement} from '../lib/inventory';
import {requestStatus} from '../lib/requests';
import {TEAM_AREAS} from '../lib/team-access';
import type {SharedSnapshot,SharedMember} from '../lib/shared-types';
import type {Valuation} from '../lib/valuation-types';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Lima',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmt=(n:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:4}).format(n);
const movementName=(kind:string)=>({apertura:'Stock inicial',conteo:'Conteo físico',entrada:'Entrada',recepcion:'Ingreso de mercadería',merma:'Merma',pedido:'Salida desde foto',solicitud:'Pedido enviado',despacho:'Despacho','eliminar-orden':'Orden eliminada','vincular-area':'Vínculo de área','vincular-areas':'Vínculos de áreas',reversion:'Reversión',importar:'Importación'} as Record<string,string>)[kind]||kind;
const navigation=[
 {id:'inicio',name:'Resumen',icon:LayoutDashboard},
 {id:'stock',name:'Inventario diario',icon:Boxes},
 {id:'valores',name:'Valor de mercadería',icon:Coins},
 {id:'ingreso',name:'Ingreso de mercadería',icon:PackagePlus},
 {id:'pedido',name:'Pedidos por área',icon:ClipboardList},
 {id:'despacho',name:'Despachos',icon:PackageCheck},
 {id:'ordenes',name:'Órdenes de despacho',icon:List},
 {id:'consulta',name:'Consulta por fecha',icon:CalendarDays},
 {id:'catalogo',name:'Catálogo de insumos',icon:List},
 {id:'historial',name:'Movimientos',icon:History},
 {id:'equipo',name:'Equipo',icon:Users},
];
function downloadData(content:string,name:string,type='text/csv;charset=utf-8'){
 const url=URL.createObjectURL(new Blob([content],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const csv=(rows:unknown[][])=>'\ufeff'+rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(',')).join('\r\n');

export default function SharedAdmin(){
 const [token,setToken]=useState(''),[data,setData]=useState<SharedSnapshot|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 async function load(secret:string){
  setLoading(true);setError('');
  try{
   if(!/^[A-Za-z0-9_-]{43,128}$/.test(secret))throw Error('Abre el enlace completo que te compartió administración.');
   const response=await fetch('/api/consulta',{headers:{Authorization:'Bearer '+secret},cache:'no-store'}),snapshot=await response.json() as SharedSnapshot&{error?:string};
   if(!response.ok)throw Error(snapshot.error||'No se pudo abrir la consulta.');
   if(snapshot.role!=='viewer'||!snapshot.readOnly)throw Error('No se pudo verificar el acceso de consulta.');
   setData(snapshot);
  }catch(e){setData(null);setError((e as Error).message)}finally{setLoading(false)}
 }
 useEffect(()=>{const secret=new URLSearchParams(window.location.hash.slice(1)).get('token')||'';setToken(secret);load(secret)},[]);
 if(!data)return <main className="access-screen"><section className="access-card"><div className="access-brand">SHIMAYA <small>RAMEN · INVENTARIOS</small></div><div className="access-icon"><ShieldCheck size={32}/></div><h1>{loading?'Abriendo consulta…':'Consulta no disponible'}</h1><p>Administración · Solo lectura</p>{loading?<LoaderCircle className="spin" size={24}/>:<><p role="alert">{error}</p><button className="btn full" onClick={()=>load(token)}>Volver a intentar</button></>}</section></main>;
 return <SharedContent data={data} token={token} loading={loading} error={error} onReload={()=>load(token)}/>;
}

export function SharedContent({data,token,loading=false,error='',onReload,initialTab='inicio'}:{data:SharedSnapshot;token:string;loading?:boolean;error?:string;onReload:()=>void;initialTab?:string}){
 const [tab,setTab]=useState(initialTab),[date,setDate]=useState(today()),[movementId,setMovementId]=useState(''),[fileError,setFileError]=useState(''),[fileBusy,setFileBusy]=useState(false);
 const {state,valuation,members}=data;
 async function downloadFile(kind:'pdf'|'photo',hash:string,name:string){
  setFileBusy(true);setFileError('');
  try{const response=await fetch('/api/consulta/file/'+kind+'/'+encodeURIComponent(hash),{headers:{Authorization:'Bearer '+token},cache:'no-store'});if(!response.ok){const result=await response.json() as {error?:string};throw Error(result.error||'No se pudo descargar el comprobante.')}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=kind==='photo'?'comprobante.'+(blob.type==='image/png'?'png':blob.type==='image/webp'?'webp':'jpg'):name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}catch(e){setFileError((e as Error).message)}finally{setFileBusy(false)}
 }
 const selected=navigation.find(n=>n.id===tab)||navigation[0];
 return <div className="shell shared-shell"><aside className="sidebar"><div className="brand"><ShieldCheck size={36}/><div>SHIMAYA<small>RAMEN · INVENTARIOS</small></div></div><div className="workspace"><span className="workspace-icon"><ShieldCheck size={17}/></span><div>Administración<small>Solo lectura</small></div></div><div className="nav-label">CONSULTA DEL NEGOCIO</div><nav aria-label="Apartados de consulta">{navigation.map(n=><button key={n.id} className={tab===n.id?'active':''} aria-current={tab===n.id?'page':undefined} onClick={()=>{setTab(n.id);setMovementId('')}}><n.icon size={19}/>{n.name}</button>)}</nav></aside>
 <main><header className="topbar"><div className="breadcrumb">Shimaya Ramen <span>/</span><strong>{selected.name}</strong></div><div className="top-actions"><span className="shared-label"><ShieldCheck size={16}/>Administración · Solo lectura</span><button className="icon-btn" title="Actualizar datos" aria-label="Actualizar datos" disabled={loading} onClick={onReload}><RefreshCw size={17}/></button></div></header><div className="content">
 <div className="page-head"><div><div className="eyebrow">SHIMAYA / CONSULTA</div><h1>{selected.name}</h1><p>Puedes consultar todos los apartados y descargar reportes. Este acceso no permite modificar datos.</p></div>{['inicio','stock'].includes(tab)&&<label className="date-picker"><span>Fecha a consultar</span><input aria-label="Fecha del resumen" type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>}</div>
 {(error||fileError)&&<div className="error" role="alert">{error||fileError}</div>}{loading&&<div className="loading"><LoaderCircle className="spin" size={18}/>Actualizando datos…</div>}
 {['inicio','stock'].includes(tab)&&<ValuationSummary data={valuation} onReload={onReload} onOpen={()=>setTab('valores')}/>}
 {tab==='inicio'&&<InventoryDashboard readOnly state={state} valuation={valuation} date={date} busy={loading} onImport={()=>{}} onInventory={()=>setTab('stock')} onQuery={()=>setTab('consulta')} onMovement={m=>{setMovementId(m.id);setTab('historial')}}/>}
 {tab==='stock'&&<SharedStock state={state} valuation={valuation}/>}
 {tab==='valores'&&<ValuationDashboard readOnly data={valuation} error={error} onReload={onReload} onSaved={()=>{}}/>}
 {tab==='consulta'&&<DailyActivity state={state} initialDate={date} reportEndpoint="/api/consulta/daily" reportHeaders={{Authorization:'Bearer '+token}}/>}
 {tab==='catalogo'&&<><SharedStock state={state} valuation={valuation}/><AreaCatalog state={state}/></>}
 {tab==='pedido'&&<><AreaCatalog state={state}/><SharedOrders state={state}/></>}
 {(tab==='despacho'||tab==='ordenes')&&<SharedOrders state={state} dispatchOnly={tab==='despacho'}/>}
 {(tab==='ingreso'||tab==='historial')&&<SharedMovements key={tab} state={state} receiptsOnly={tab==='ingreso'} selectedId={movementId} downloadFile={downloadFile} fileBusy={fileBusy}/>}
 {tab==='equipo'&&<SharedTeam members={members}/>}
 <footer className="main-footer"><span>SHIMAYA RAMEN · Administración · Solo lectura</span><button className="text-btn" onClick={()=>downloadData(JSON.stringify({...data,exportedAt:new Date().toISOString()},null,2),'shimaya-consulta-'+today()+'.json','application/json')}>Descargar datos de consulta</button></footer>
 </div></main></div>;
}

function Paging({total,page,size,onPage}:{total:number;page:number;size:number;onPage:(n:number)=>void}){
 const pages=Math.max(1,Math.ceil(total/size));return <div className="pagination"><span>{total} registros · Página {page} de {pages}</span><div><button className="icon-btn" aria-label="Página anterior" disabled={page<=1} onClick={()=>onPage(page-1)}>‹</button><button className="icon-btn" aria-label="Página siguiente" disabled={page>=pages} onClick={()=>onPage(page+1)}>›</button></div></div>;
}
export function SharedStock({state,valuation}:{state:State;valuation:Valuation}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('todos'),[page,setPage]=useState(1);
 const rows=state.ingredients.filter(i=>normalize(i.name+' '+i.category+' '+(i.aliases||'')).includes(normalize(query))&&(filter==='todos'||filter==='positivo'&&i.stock>0||filter==='cero'&&i.stock===0||filter==='negativo'&&i.stock<0||filter==='pendiente'&&!configured(i)||filter==='noOrder'&&i.noOrder));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/25))),costs=new Map(valuation.rows.map(r=>[r.ingredientId,r]));
 return <section className="panel inventory-panel"><div className="section-title"><div><h2>Stock y catálogo completo</h2><p>{state.ingredients.length} insumos · cantidades y unidades actuales.</p></div><button className="btn secondary" onClick={()=>downloadData(csv([['Insumo','Categoría','Unidad','Stock','Mínimo','No pedir','Alias'],...state.ingredients.map(i=>[i.name,i.category,i.unit,i.stock,i.minimum,i.noOrder?'Sí':'No',i.aliases])]),'shimaya-stock-'+today()+'.csv')}><Download size={16}/>Exportar inventario</button></div>
 <div className="toolbar"><div className="search"><Search size={17}/><input aria-label="Buscar en el catálogo" placeholder="Buscar insumo…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><select aria-label="Filtrar stock" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="todos">Todos los insumos</option><option value="positivo">Con stock</option><option value="cero">Stock en cero</option><option value="negativo">Stock negativo</option><option value="pendiente">Por configurar</option><option value="noOrder">Marcados NO PEDIR</option></select></div>
 <div className="table-wrap"><table><thead><tr><th>INSUMO</th><th>UNIDAD</th><th>STOCK</th><th>MÍNIMO</th><th>ESTADO</th><th>COSTO UNITARIO CON IGV</th><th>VALOR DISPONIBLE</th></tr></thead><tbody>{rows.slice((current-1)*25,current*25).map(i=>{const value=costs.get(i.id);return <tr key={i.id}><td data-label="Insumo" className="name-cell"><strong>{i.name}</strong><small>{i.category}</small>{i.aliases&&<small>Alias: {i.aliases}</small>}</td><td data-label="Unidad">{i.unit||i.sourceUnit||'Por definir'}{i.unitNote&&<small>{i.unitNote}</small>}</td><td data-label="Stock" className={i.stock<0?'red':''}><strong>{fmt(i.stock)}</strong></td><td data-label="Mínimo">{fmt(i.minimum)}</td><td data-label="Estado"><span className={'status '+(i.stock<0?'low':i.stock>0?'ok':'neutral')}>{i.stock<0?'Faltante':i.stock>0?'Disponible':'En cero'}</span>{!configured(i)&&<small>{i.unitIssue||'Por configurar'}</small>}{i.noOrder&&<small>NO PEDIR</small>}</td><td data-label="Costo unitario con IGV">{value?.unitGross!=null?soles(value.unitGross,4):'Sin precio'}</td><td data-label="Valor disponible">{value?.valueGross!=null?soles(value.valueGross):'Sin valorizar'}</td></tr>})}</tbody></table></div>{!rows.length&&<p className="request-empty">No hay insumos con este filtro.</p>}<Paging total={rows.length} page={current} size={25} onPage={setPage}/></section>;
}
export function AreaCatalog({state}:{state:State}){
 const [area,setArea]=useState('Barra'),[query,setQuery]=useState('');
 const rows=(state.areaItems||[]).filter(i=>(!area||i.area===area)&&normalize(i.name+' '+i.group).includes(normalize(query)));
 return <section className="panel inventory-panel shared-section"><div className="section-title"><div><h2>Insumos por área</h2><p>Nombres del Excel, unidades y vínculo con el almacén.</p></div><span className="badge">{rows.length} ítems</span></div><div className="toolbar"><label className="field"><span>Área</span><select aria-label="Área del catálogo" value={area} onChange={e=>setArea(e.target.value)}><option value="">Todas las áreas</option>{TEAM_AREAS.map(a=><option key={a}>{a}</option>)}</select></label><div className="search"><Search size={17}/><input aria-label="Buscar insumo del área" placeholder="Buscar en el área…" value={query} onChange={e=>setQuery(e.target.value)}/></div></div>
 <div className="table-wrap"><table><thead><tr><th>ÍTEM / ÁREA</th><th>GRUPO</th><th>UNIDAD DEL EXCEL</th><th>INSUMO DE ALMACÉN / UNIDAD</th><th>ESTADO</th></tr></thead><tbody>{rows.map(item=>{const linked=state.ingredients.filter(i=>i.id===item.ingredientId||item.ingredientOptions?.includes(i.id));return <tr key={item.id}><td data-label="Ítem / área" className="name-cell"><strong>{item.name}</strong><small>{item.area}</small></td><td data-label="Grupo">{item.group}</td><td data-label="Unidad del Excel">{item.referenceUnit||'Sin unidad indicada'}</td><td data-label="Insumo de almacén / unidad">{linked.length?linked.map(i=><div key={i.id}>{i.name}<small>{i.unit||i.sourceUnit||'Por definir'}{i.unitNote?' · '+i.unitNote:''}</small></div>):'Sin vínculo'}</td><td data-label="Estado">{item.active===false?'Inactivo':'Activo'}{item.reason&&<small>{item.reason}</small>}</td></tr>})}</tbody></table></div>{!rows.length&&<p className="request-empty">No hay ítems con este filtro.</p>}</section>;
}
export function SharedOrders({state,dispatchOnly=false}:{state:State;dispatchOnly?:boolean}){
 const [area,setArea]=useState(''),[date,setDate]=useState(''),[status,setStatus]=useState('todos'),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const rows=(state.requests||[]).filter(r=>(!area||r.area===area)&&(!date||(dispatchOnly?r.dispatches.some(d=>d.date===date):r.date===date))&&(!dispatchOnly||r.dispatches.length>0)&&normalize(r.number+' '+r.requester+' '+r.note+' '+r.lines.map(l=>l.name).join(' ')).includes(normalize(query))&&(status==='todos'||status==='eliminado'&&r.deleted||status==='pendiente'&&!r.deleted&&!r.closed||status==='cerrado'&&!r.deleted&&r.closed));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/20)));
 return <section className="panel shared-section"><div className="section-title"><div><h2>{dispatchOnly?'Entregas registradas':'Todos los pedidos y sus despachos'}</h2><p>Incluye cantidades pedidas, entregadas, adicionales y órdenes eliminadas.</p></div></div><div className="toolbar shared-filters"><div className="search"><Search size={17}/><input aria-label="Buscar pedidos" placeholder="Pedido, responsable o insumo…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><select aria-label="Área de los pedidos" value={area} onChange={e=>{setArea(e.target.value);setPage(1)}}><option value="">Todas las áreas</option>{TEAM_AREAS.map(a=><option key={a}>{a}</option>)}</select><select aria-label="Estado de los pedidos" value={status} onChange={e=>{setStatus(e.target.value);setPage(1)}}><option value="todos">Todos los estados</option><option value="pendiente">Pendientes</option><option value="cerrado">Cerrados</option><option value="eliminado">Eliminados</option></select><label className="field"><span>{dispatchOnly?'Fecha del despacho':'Fecha del pedido'}</span><input aria-label="Fecha de los pedidos" type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(1)}}/></label>{date&&<button className="text-btn" onClick={()=>setDate('')}>Ver todas las fechas</button>}</div>
 {!rows.length?<p className="request-empty">No hay registros con estos filtros.</p>:rows.slice((current-1)*20,current*20).map(r=><details key={r.id} className="receipt-record"><summary><strong>{r.number} · {r.area}</strong><span>{r.date} · {r.requester} · {requestStatus(r)}</span></summary><RequestDetails r={r}/></details>)}<Paging total={rows.length} page={current} size={20} onPage={setPage}/></section>;
}
export function SharedMovements({state,receiptsOnly=false,selectedId='',downloadFile,fileBusy=false}:{state:State;receiptsOnly?:boolean;selectedId?:string;downloadFile:(kind:'pdf'|'photo',hash:string,name:string)=>Promise<void>;fileBusy?:boolean}){
 const [query,setQuery]=useState(''),[date,setDate]=useState(''),[kind,setKind]=useState(''),[page,setPage]=useState(1);
 const filtered=state.movements.filter(m=>(!receiptsOnly||m.kind==='recepcion')&&(!date||m.date===date)&&(!kind||m.kind===kind)&&normalize(m.reference+' '+m.note+' '+m.lines.map(l=>l.name).join(' ')).includes(normalize(query)));
 const selected=selectedId&&!query&&!date&&!kind?state.movements.find(m=>m.id===selectedId):undefined;
 const rows=selected&&!filtered.slice((page-1)*20,page*20).some(m=>m.id===selectedId)?[selected,...filtered.filter(m=>m.id!==selectedId)]:filtered;
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/20)));
 return <section className="panel shared-section"><div className="section-title"><div><h2>{receiptsOnly?'Ingresos de mercadería y documentos':'Historial de movimientos'}</h2><p>Cantidades, saldos antes y después, notas y comprobantes.</p></div><button className="btn secondary" onClick={()=>downloadData(csv([['Fecha','Tipo','Referencia','Insumo','Cantidad','Unidad','Antes','Después','Revertido'],...filtered.flatMap(m=>m.lines.map(l=>[m.date,movementName(m.kind),m.reference,l.name,l.delta,l.unit,l.before,l.after,m.reversed?'Sí':'No']))]),'shimaya-movimientos-'+today()+'.csv')}><Download size={16}/>Exportar movimientos</button></div>
 <div className="toolbar shared-filters"><div className="search"><Search size={17}/><input aria-label="Buscar movimientos" placeholder="Insumo, referencia o nota…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><label className="field"><span>Fecha</span><input aria-label="Fecha de movimientos" type="date" value={date} onChange={e=>{setDate(e.target.value);setPage(1)}}/></label>{!receiptsOnly&&<select aria-label="Tipo de movimiento" value={kind} onChange={e=>{setKind(e.target.value);setPage(1)}}><option value="">Todos los movimientos</option>{Array.from(new Set(state.movements.map(m=>m.kind))).map(k=><option key={k} value={k}>{movementName(k)}</option>)}</select>}{date&&<button className="text-btn" onClick={()=>setDate('')}>Ver todas las fechas</button>}</div>
 {!rows.length?<p className="request-empty">No hay movimientos con estos filtros.</p>:rows.slice((current-1)*20,current*20).map(m=><details className="receipt-record" key={m.id} open={m.id===selectedId?true:undefined}><summary><strong>{movementName(m.kind)} · {m.reference||'Sin referencia'}</strong><span>{m.date} · {m.lines.length} insumos{m.reversed?' · Revertido':''}</span></summary><MovementContent movement={m} downloadFile={downloadFile} fileBusy={fileBusy}/></details>)}<Paging total={rows.length} page={current} size={20} onPage={setPage}/></section>;
}
export function MovementContent({movement:m,downloadFile,fileBusy=false}:{movement:Movement;downloadFile:(kind:'pdf'|'photo',hash:string,name:string)=>Promise<void>;fileBusy?:boolean}){
 return <>{m.note&&<p>{m.note}</p>}{m.document&&<button className="text-btn" disabled={fileBusy} onClick={()=>downloadFile('pdf',m.document!.hash,m.document!.name)}><Download size={16}/>Descargar PDF: {m.document.name}</button>}{Array.from(new Set([...(m.photos||[]),...(m.photoColumns||[]).map(p=>p.hash)])).map((hash,index)=><button className="text-btn" key={hash} disabled={fileBusy} onClick={()=>downloadFile('photo',hash,'comprobante-'+(index+1)+'.jpg')}><Download size={16}/>Descargar comprobante {index+1}</button>)}<div className="table-wrap"><table><thead><tr><th>INSUMO</th><th>CANTIDAD</th><th>ANTES</th><th>DESPUÉS</th></tr></thead><tbody>{m.lines.map((line,index)=><tr key={line.ingredientId+':'+index}><td data-label="Insumo">{line.name}</td><td data-label="Cantidad">{line.delta>0?'+':''}{fmt(line.delta)} {line.unit}</td><td data-label="Antes">{fmt(line.before)} {line.unit}</td><td data-label="Después">{fmt(line.after)} {line.unit}</td></tr>)}</tbody></table></div>{!!m.orders?.length&&<div className="receipt-record-lines">{m.orders.map((order,index)=><div key={index}><span>{order.name}</span><strong>{fmt(order.quantity)}</strong></div>)}</div>}</>;
}
export function SharedTeam({members}:{members:SharedMember[]}){
 return <section className="panel inventory-panel"><div className="section-title"><div><h2>Equipo y permisos actuales</h2><p>Administración y colaboradores autorizados, pendientes o suspendidos.</p></div></div><div className="table-wrap"><table><thead><tr><th>COLABORADOR</th><th>PERFIL</th><th>ÁREA</th><th>ACCESO</th></tr></thead><tbody><tr><td data-label="Colaborador">Usuario maestro</td><td data-label="Perfil">Administración</td><td data-label="Área">Todas las áreas</td><td data-label="Acceso">Autorizado</td></tr>{members.map(m=><tr key={m.email}><td data-label="Colaborador" className="name-cell"><strong>{m.name}</strong><small>{m.email}</small></td><td data-label="Perfil">{m.role==='dispatch'?'Solo despacho':m.role==='staff'?'Solo pedido':'Pedido y despacho'}</td><td data-label="Área">{m.area||'Todas las áreas'}</td><td data-label="Acceso"><span className={'status '+(m.status==='active'?'ok':'neutral')}>{m.status==='active'?'Autorizado':m.status==='pending'?'Pendiente':'Suspendido'}</span></td></tr>)}</tbody></table></div></section>;
}
