'use client';
import {useState} from 'react';
import {Boxes,AlertTriangle,ClipboardList,PackageCheck,Search,FileSpreadsheet,CalendarDays,ChevronLeft,ChevronRight,ArrowUpRight} from 'lucide-react';
import {soles} from './valuation-dashboard';
import type {Valuation} from '../lib/valuation-types';
import {configured,normalize,type State,type Movement} from '../lib/inventory';
import {dailyActivity,recentDeductions,deductionReason} from '../lib/activity';
const fmt=(n:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:4}).format(n);
const day=(date:string)=>new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short',year:'numeric'}).format(new Date(date+'T12:00:00'));

export default function InventoryDashboard({state,valuation,date,busy,onImport,onQuery,onInventory,onMovement,readOnly=false}:{state:State;valuation?:Valuation|null;date:string;busy:boolean;onImport:()=>void;onQuery:()=>void;onInventory:()=>void;onMovement:(movement:Movement)=>void;readOnly?:boolean}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('todos'),[page,setPage]=useState(1);
 const rows=state.ingredients.filter(i=>normalize(i.name+' '+i.category).includes(normalize(query))&&(filter==='todos'||filter==='disponible'&&i.stock>0||filter==='cero'&&i.stock===0||filter==='negativo'&&i.stock<0||filter==='unidad'&&!configured(i)));
 const pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages),visible=rows.slice((current-1)*25,current*25);
 const deductions=recentDeductions(state,10),report=dailyActivity(state,date);
 const pending=(state.requests||[]).filter(r=>!r.deleted&&!r.closed&&r.lines.some(l=>l.delivered<l.quantity)).length;
 return <>
  <div className="stats">
   <Metric icon={Boxes} label="Insumos con stock" value={state.ingredients.filter(i=>i.stock>0).length} foot={`${state.ingredients.length} insumos en el inventario`}/>
   <Metric icon={AlertTriangle} label="Stock negativo" value={state.ingredients.filter(i=>i.stock<0).length} foot="Faltantes por regularizar" warning={state.ingredients.some(i=>i.stock<0)}/>
   <Metric icon={ClipboardList} label="Pedidos pendientes" value={pending} foot="De todas las áreas"/>
   <Metric icon={PackageCheck} label="Despachos de la fecha" value={report.activeDispatches} foot={day(date)}/>
  </div>
  <div className="dashboard-actions">{!readOnly&&<button className="btn" disabled={busy} onClick={onImport}><FileSpreadsheet size={17}/> Cargar mi inventario</button>}<button className="btn secondary" onClick={onQuery}><CalendarDays size={17}/> Consultar por fecha</button></div>
  <div className="inventory-overview">
   <section className="panel inventory-panel dashboard-stock">
    <div className="section-title"><div><h2>Mi inventario actual</h2><p className="small-text muted">Saldo disponible después de las entradas y descuentos.</p></div><button className="text-btn" onClick={onInventory}>{readOnly?'Ver inventario':'Registrar stock'} <ArrowUpRight size={15}/></button></div>
    <div className="toolbar dashboard-toolbar"><div className="search"><Search size={17}/><input aria-label="Buscar en mi inventario" placeholder="Buscar insumo…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><select aria-label="Filtrar mi inventario" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="todos">Todos los insumos</option><option value="disponible">Con stock</option><option value="cero">Stock en cero</option><option value="negativo">Stock negativo</option><option value="unidad">Por configurar</option></select></div>
    <div className="table-wrap"><table><thead><tr><th>INSUMO</th><th>STOCK</th><th>UNIDAD</th><th>ESTADO</th>{valuation&&<><th>COSTO UNITARIO CON IGV</th><th>VALOR DISPONIBLE</th></>}</tr></thead><tbody>
     {visible.map(i=><tr key={i.id}><td data-label="Insumo" className="name-cell"><strong>{i.name}</strong><small>{i.category}</small></td><td data-label="Stock" className={i.stock<0?'red':''}><strong>{fmt(i.stock)}</strong></td><td data-label="Unidad">{i.unit||i.sourceUnit||'Por definir'}{i.unitNote&&<small>{i.unitNote}</small>}</td><td data-label="Estado"><span className={'status '+(i.stock<0?'low':i.stock>0?'ok':'neutral')}>{i.stock<0?'Faltante':i.stock>0?'Disponible':'En cero'}</span>{!configured(i)&&<small>{i.unitIssue?'Revisar unidad':'Pendiente de configurar'}</small>}</td>{valuation&&<><td data-label="Costo unitario con IGV">{valuation.rows.find(r=>r.ingredientId===i.id)?.unitGross!=null?soles(valuation.rows.find(r=>r.ingredientId===i.id)!.unitGross!,4):'Sin precio'}</td><td data-label="Valor disponible">{valuation.rows.find(r=>r.ingredientId===i.id)?.unitGross!=null?soles(Math.max(0,i.stock)*valuation.rows.find(r=>r.ingredientId===i.id)!.unitGross!):'Sin valorizar'}</td></>}</tr>)}
    </tbody></table></div>
    {!visible.length&&<p className="request-empty">No hay insumos con este filtro.</p>}
    <div className="pagination"><span>{rows.length} insumos · Página {current} de {pages}</span><div><button className="icon-btn" aria-label="Inventario anterior" disabled={current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button><button className="icon-btn" aria-label="Inventario siguiente" disabled={current>=pages} onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button></div></div>
   </section>
   <section className="panel recent-deductions"><div className="section-title"><div><h2>Últimos descuentos</h2><p className="small-text muted">Cantidad descontada y saldo después de cada movimiento.</p></div></div>
    {!deductions.length?<div className="request-empty"><Boxes size={28}/><strong>Todavía no hay descuentos</strong><p>Al despachar, aquí verás el insumo, la cantidad y el stock que queda.</p></div>:deductions.map(({id,movement,line})=><button className="deduction-row" key={id} onClick={()=>onMovement(movement)}><div><strong>{line.name}</strong><small>{deductionReason(movement)} · {movement.reference||'Sin referencia'}</small><small>{day(movement.date)} · Saldo: {fmt(line.after)} {line.unit}</small></div><span>−{fmt(-line.delta)}<small>{line.unit}</small></span></button>)}
   </section>
  </div>
 </>;
}
function Metric({icon:Icon,label,value,foot,warning=false}:{icon:typeof Boxes;label:string;value:number;foot:string;warning?:boolean}){return <div className={'stat '+(warning?'warning':'')}><div><Icon size={19}/>{label}</div><strong>{value}</strong><small>{foot}</small></div>}
