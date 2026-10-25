'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,LoaderCircle,RefreshCw,Search,ShieldCheck} from 'lucide-react';
import {normalize} from '../lib/inventory';
import type {StockItem,StockSnapshot} from '../lib/stock-types';
const fmt=(value:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:4}).format(value);
export default function StockConsultation({revision}:{revision:number}){
 const [items,setItems]=useState<StockItem[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[updatedAt,setUpdatedAt]=useState('');
 const mounted=useRef(false),sequence=useRef(0);
 async function load(){
  const request=++sequence.current;setLoading(true);
  try{
   const response=await fetch('/api/stock',{cache:'no-store'}),data=await response.json() as StockSnapshot&{error?:string};
   if(!response.ok)throw Error(data.error||'No se pudo consultar el stock.');
   if(!data.readOnly||!Array.isArray(data.items))throw Error('No se pudo cargar la consulta de stock.');
   if(mounted.current&&sequence.current===request){setItems(data.items);setError('');setUpdatedAt(new Intl.DateTimeFormat('es-PE',{timeZone:'America/Lima',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date()))}
  }catch(e){if(mounted.current&&sequence.current===request){setError((e as Error).message);setItems([])}}finally{if(mounted.current&&sequence.current===request)setLoading(false)}
 }
 useEffect(()=>{mounted.current=true;load();const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},15000);return()=>{mounted.current=false;sequence.current++;clearInterval(timer)}},[revision]);
 return <StockList items={items} loading={loading} error={error} updatedAt={updatedAt} onReload={load}/>;
}
export function StockList({items,loading=false,error='',updatedAt='',onReload}:{items:StockItem[];loading?:boolean;error?:string;updatedAt?:string;onReload:()=>void}){
 const [query,setQuery]=useState(''),[filter,setFilter]=useState('todos'),[page,setPage]=useState(1);
 const rows=items.filter(i=>normalize(i.name+' '+i.category).includes(normalize(query))&&(filter==='todos'||filter==='positivo'&&i.stock>0||filter==='cero'&&i.stock===0||filter==='negativo'&&i.stock<0));
 const pages=Math.max(1,Math.ceil(rows.length/25)),current=Math.min(page,pages);
 return <><div className="hint"><ShieldCheck size={18}/><p>Solo lectura. Consulta cuánto queda en el almacén. Los saldos negativos indican faltantes por abastecer.</p></div>{error&&<div className="error" role="alert">{error}</div>}
 <section className="panel inventory-panel"><div className="section-title"><div><h2>Stock disponible <span className="count">{items.length}</span></h2><p>Actualización automática cada 15 segundos.{updatedAt?' Última consulta: '+updatedAt+'.':''}</p></div><button className="btn secondary" disabled={loading} onClick={onReload}>{loading?<LoaderCircle className="spin" size={16}/>:<RefreshCw size={16}/>}Actualizar stock</button></div>
 <div className="toolbar"><div className="search"><Search size={17}/><input aria-label="Buscar en stock disponible" placeholder="Buscar insumo…" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}}/></div><select aria-label="Filtrar stock disponible" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1)}}><option value="todos">Todos los insumos</option><option value="positivo">Con stock</option><option value="cero">Stock en cero</option><option value="negativo">Stock negativo</option></select></div>
 <div className="table-wrap"><table><thead><tr><th scope="col">INSUMO</th><th scope="col">UNIDAD</th><th scope="col">STOCK ACTUAL</th><th scope="col">ESTADO</th></tr></thead><tbody>{rows.slice((current-1)*25,current*25).map(i=><tr key={i.id}><td data-label="Insumo" className="name-cell"><strong>{i.name}</strong><small>{i.category}</small>{i.noOrder&&<small>NO PEDIR</small>}</td><td data-label="Unidad">{i.unit}{i.unitNote&&<small>{i.unitNote}</small>}</td><td data-label="Stock actual" className={i.stock<0?'red':''}><strong>{fmt(i.stock)}</strong></td><td data-label="Estado"><span className={'status '+(i.stock<0?'low':i.stock>0?'ok':'neutral')}>{i.stock<0?'Faltante':i.stock>0?'Disponible':'En cero'}</span>{!i.configured&&<small>Unidad por confirmar</small>}</td></tr>)}</tbody></table></div>
 {!rows.length&&<p className="request-empty">{loading?'Cargando stock…':error?'La consulta no está disponible.':!items.length?'No hay insumos en el inventario.':'No hay insumos con este filtro.'}</p>}
 <div className="pagination"><span>{rows.length} insumos · Página {current} de {pages}</span><div><button className="icon-btn" aria-label="Stock anterior" disabled={current<=1} onClick={()=>setPage(current-1)}><ChevronLeft size={17}/></button><button className="icon-btn" aria-label="Stock siguiente" disabled={current>=pages} onClick={()=>setPage(current+1)}><ChevronRight size={17}/></button></div></div></section></>;
}
