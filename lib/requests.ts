import {areaSource} from './areas-source.ts';
import {canonicalUnit as unitKey} from './units.ts';
import type {Ingredient,State,Movement} from './inventory.ts';
export type AreaItem={id:string;area:string;group:string;name:string;referenceUnit:string;source:string;ingredientId:string;ingredientOptions?:string[];linkReviewed?:boolean;suggestedIngredientId?:string;sourceName?:string;active?:boolean;reason?:string};
export type RequestLine={itemId:string;name:string;ingredientId:string;ingredientName?:string;presentationSelected?:boolean;quantity:number;unit:string;delivered:number};
export type Requisition={id:string;number:string;date:string;at:string;area:string;requester:string;actorId:string;note:string;lines:RequestLine[];dispatches:{id:string;date:string;at:string;dispatcher:string;note:string;quantities:{itemId:string;quantity:number}[];reversed?:boolean}[];closed:boolean;deleted?:{at:string;date:string;by:string;actorId:string;note:string;movementId:string}};
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases:Record<string,string>={AJOS:'AJO',RABANITO:'RABANO',LAYU:'LA YU SHIMAYA X 100ML','DIGION':'SALSA DIJON','KUROI':'SALSA KUROY','AMAIRIU':'SALSA AMAI RYU','PACHIKAI':'SALSA PACHIKAY','SALDASHI':'SAL DASHI X 100GR','MOYASHI':'MOYASHI','TE MUGICHA':'TE MUJICHA X 52UND','TE OCHA':'CAJA TE VERDE PQTE X 100 UND','CASHEWS TOSTAO':'ALMENDRA CASHU','BOLSAS SHIMAYA':'PAQUETE BOLSAS DE PAPEL SHIMAYA 300 UNIDADES','OHASHI':'PAQUETE DE OHASHI','TOCAS':'TOCAS DE COCINA','SALMON':'PAQUETE DE SALMON','PULPO':'PAQUETE DE PULPO','EBI MADRE SAZONADORA':'SALSA EBI RAMEN (MADRE) SAZONADA X 500GR','VEGETARIANA SAZONADORA':'VEGETARIANA SAZONADA','FRUTOS DEL BOSQUE':'ESCENCIA FRUTOS DEL BOSQUE X 1LT','CORDIAL DE KYURI':'CORDIAL PEPINO X 1LT','CORDIAL DE KION':'MIX KION X 500GR','CORDIAL DE LYCHEE':'LYCHEE BLOOM X 1KG'};
function base(s:string){return fold(s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\(NO PEDIR\)/g,'').replace(/\d+(?:[.,]\d+)?\s*(?:KG|GR|G|ML|LT|L|UND|UNID|UNIDADES|UNDS|LAMINAS|PORCIONES|PORC|PLANCHAS|BROCHETAS)\b/g,'').replace(/\d+/g,'').replace(/\b(?:DE|POR|X|PAQUETE|PAQUETES|PAQT|PQTE|PACK|BOLSA|BOLSAS|CAJA|GALON|BOTELLA|SACO|POTE|UNID|UNIDADES|UND|LAMINAS)\b/g,''))}
export function seedAreas(ingredients:Ingredient[]):AreaItem[]{
 const prepared=ingredients.map(i=>({i,name:fold(i.name),base:base(i.name)}));
 return areaSource.map(item=>{const name=fold(item.name),key=base(item.name),salsa=base('SALSA '+item.name);const exact=prepared.find(i=>i.name===name);const alias=Object.entries(aliases).find(([n])=>fold(n)===name)?.[1];let candidates=prepared.filter(i=>alias?i.name===fold(alias):i.base===key||i.base===salsa);if(!candidates.length)candidates=prepared.filter(i=>key.length>5&&i.base.endsWith(key));return {...item,ingredientId:exact?.i.id||'',suggestedIngredientId:!exact&&candidates.length===1?candidates[0].i.id:''}})
}
export function requestStatus(r:Requisition){if(r.deleted)return 'Eliminada';if(r.lines.every(l=>l.delivered>=l.quantity))return 'Completo';if(r.closed)return r.lines.some(l=>l.delivered>0)?'Parcial · cerrado':'Sin despacho';return r.lines.some(l=>l.delivered>0)?'Parcial · pendiente':'Pendiente'}
export function pendingQuantity(line:RequestLine){return Math.max(0,Math.round((line.quantity-line.delivered)*1e6)/1e6)}
export function additionalQuantity(line:RequestLine){return Math.max(0,Math.round((line.delivered-line.quantity)*1e6)/1e6)}
export function dispatchQuantity(line:RequestLine,choice:string|undefined,entered?:string){return choice==='completo'?pendingQuantity(line):choice==='parcial'?Number(entered):0}
export function canPerform(role:string,type:string){return role==='admin'||role==='operator'&&(type==='solicitar'||type==='despachar')||role==='staff'&&type==='solicitar'||role==='dispatch'&&type==='despachar'}
export function requestIngredient(s:State,item:AreaItem,selection?:string){return s.ingredients.find(i=>i.id===(selection||item.ingredientId))}
export function requestUnit(s:State,item:AreaItem,selection?:string){const i=requestIngredient(s,item,selection);return unitKey(i?.sourceUnit||i?.unit||item.referenceUnit)}
export function dispatchIngredientId(s:State,line:RequestLine){return line.delivered>0||line.presentationSelected?line.ingredientId:s.areaItems?.find(i=>i.id===line.itemId)?.ingredientId||line.ingredientId}
function fail(message:string):never{throw Error(message)}
function quantity(v:any,positive=false){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1e8||(positive&&v<=0))fail('Cantidad inválida.');const n=Math.round(v*1e6)/1e6;if(positive&&n===0)fail('Cantidad demasiado pequeña.');return n}
type Conversion=(n:number,from:string,to:string,ingredient?:Ingredient)=>number;
export function dispatchUnit(i:Ingredient){
 if(i.unitIssue)fail('Revisa la unidad de '+i.name+' antes de despachar.');
 const unit=unitKey(i.unit||i.sourceUnit||'');if(!unit)fail('Configura la unidad de '+i.name+' para despachar.');
 return unit;
}
export function orderRestocks(s:State,r:Requisition,convert:Conversion){
 if(r.deleted)fail('La orden ya fue eliminada.');
 const totals=new Map<string,{ingredientId:string;name:string;unit:string;quantity:number}>();
 const dispatchIds=new Set(r.dispatches.map(d=>d.id));
 if(s.movements.some(m=>m.requestId===r.id&&m.kind==='despacho'&&!m.reversed&&!dispatchIds.has(m.id)))fail('Revisa el historial de esta orden antes de eliminarla.');
 for(const d of r.dispatches){
  if(d.reversed)continue;
  const m=s.movements.find(m=>m.id===d.id&&m.kind==='despacho'&&m.requestId===r.id);
  if(!m||m.reversed||d.quantities.some(q=>q.quantity>0)&&!m.lines.some(l=>l.delta<0))fail('No se pudo verificar el stock descontado de esta orden. Revisa su historial.');
  for(const l of m.lines){
   if(!Number.isFinite(l.delta)||l.delta>0)fail('El historial del despacho tiene una cantidad inválida.');
   if(l.delta===0)continue;
   const i=s.ingredients.find(i=>i.id===l.ingredientId);if(!i||!i.unit)fail('No se encontró el insumo o su unidad para devolver el stock: '+l.name);
   const amount=convert(-l.delta,l.unit,i.unit,i),previous=totals.get(i.id);
   const total=quantity((previous?.quantity||0)+amount,true);
   if(!Number.isFinite(i.stock+total)||Math.abs(i.stock+total)>1e8)fail('La devolución supera el rango de stock permitido: '+i.name);
   totals.set(i.id,{ingredientId:i.id,name:i.name,unit:i.unit,quantity:total});
  }
 }
 return [...totals.values()];
}
export function applyWorkflow(s:State,a:any,move:Movement,adjust:(i:Ingredient,next:number)=>void,convert:(n:number,from:string,to:string,ingredient?:Ingredient)=>number,canonicalUnit:(s:string)=>string):boolean{
 const items=s.areaItems??=seedAreas(s.ingredients),requests=s.requests??=[];
 if(a.type==='vincular-areas'){
  if(!Array.isArray(a.links)||!a.links.length||a.links.length>300)fail('Selecciona los vínculos revisados.');
  const seen=new Set<string>();for(const link of a.links){if(seen.has(link.itemId))fail('Vínculo repetido.');seen.add(link.itemId);applyWorkflow(s,{type:'vincular-area',...link},move,adjust,convert,canonicalUnit)}move.note='Vínculos de áreas revisados: '+a.links.length;return true;
 }
 if(a.type==='vincular-area'){
  const item=items.find(i=>i.id===a.itemId),ingredient=s.ingredients.find(i=>i.id===a.ingredientId);
  if(!item||!ingredient)fail('Selecciona un insumo del catálogo.');
  if(requests.some(r=>!r.deleted&&r.lines.some(l=>l.itemId===item.id&&l.delivered>0)&&!r.closed))fail('Este insumo tiene un despacho parcial pendiente. Termina el pedido antes de cambiar el vínculo.');
  const source=areaSource.find(i=>i.id===item.id),manual=['INGRESO DE MERCADERÍA','STOCK DE ALMACÉN','AGREGADO POR ADMINISTRACIÓN'].includes(item.source);if(!source&&!manual)fail('Esta fila es histórica. Configura la fila original del Excel.');
  item.ingredientId=ingredient.id;item.ingredientOptions=undefined;item.linkReviewed=true;item.name=source?.name||item.sourceName||item.name;item.sourceName=item.name;item.referenceUnit=ingredient.sourceUnit||ingredient.unit;item.active=true;item.reason='';move.note='Vínculo de área: '+item.area+' · '+item.name;return true;
 }
 if(a.type==='solicitar'){
  if(requests.some(r=>r.id===move.id))return true;
  if(!items.some(i=>i.area===a.area))fail('Selecciona un área válida.');
  if(typeof a.requester!=='string'||!a.requester.trim()||a.requester.length>200)fail('Ingresa quién solicita el pedido.');
  if(!Array.isArray(a.lines)||!a.lines.length||a.lines.length>300)fail('Agrega los insumos de tu pedido.');const seen=new Set<string>();
  const lines:RequestLine[]=a.lines.map((l:any)=>{
   const item=items.find(i=>i.id===l.itemId&&i.area===a.area);if(!item||seen.has(item.id))fail('Insumo repetido o ajeno al área.');
   if(item.active===false)fail('Este insumo no está habilitado en el catálogo actualizado.');seen.add(item.id);
   const presentationSelected=!!item.ingredientOptions?.length,ingredientId=presentationSelected?(l.ingredientId||item.ingredientId):item.ingredientId;
   if(presentationSelected&&!item.ingredientOptions!.includes(ingredientId))fail('Selecciona la presentación de '+item.name);
   const i=s.ingredients.find(i=>i.id===ingredientId);if(!i)fail('Vincula el insumo al inventario: '+item.name);
   if(i.noOrder)fail('Este insumo está marcado NO PEDIR: '+i.name);
   if(typeof l.unit!=='string'||!canonicalUnit(l.unit))fail('Selecciona una unidad para '+item.name);
   if(i.catalogId&&canonicalUnit(l.unit)!==canonicalUnit(i.sourceUnit||''))fail('Usa la unidad del catálogo para '+item.name);
   return {itemId:item.id,name:item.name,ingredientId:i.id,ingredientName:i.name,presentationSelected,quantity:quantity(l.quantity,true),unit:canonicalUnit(l.unit),delivered:0};
  });
  requests.unshift({id:move.id,number:'PED-'+String(requests.length+1).padStart(5,'0'),date:move.date,at:move.at,area:a.area,requester:a.requester.trim(),actorId:String(a.actorId||''),note:move.note,lines,dispatches:[],closed:false});move.kind='solicitud';move.reference=requests[0].number;return true;
 }
 if(a.type==='despachar'){
  const r=requests.find(r=>r.id===a.requestId);if(!r||r.deleted||r.closed||r.lines.every(l=>l.delivered>=l.quantity))fail('El pedido ya está cerrado, eliminado o no existe.');
  if(typeof a.dispatcher!=='string'||!a.dispatcher.trim()||a.dispatcher.length>200)fail('Ingresa el responsable del despacho.');
  if(!Array.isArray(a.lines)||a.lines.length!==r.lines.length)fail('Revisa todas las líneas del despacho.');const seen=new Set<string>();let total=0;
  const quantities=a.lines.map((entry:any)=>{const l=r.lines.find(l=>l.itemId===entry.itemId);if(!l||seen.has(l.itemId))fail('Línea inválida o repetida.');seen.add(l.itemId);const q=quantity(entry.quantity);if(q>0){const i=s.ingredients.find(i=>i.id===dispatchIngredientId(s,l));if(!i)fail('Vincula primero el insumo al catálogo: '+l.name);const unit=dispatchUnit(i),amount=convert(q,l.unit,unit,i);i.unit=unit;adjust(i,i.stock-amount);i.configured=true;l.ingredientId=i.id;l.delivered=quantity(l.delivered+q);total+=q;}return {itemId:l.itemId,quantity:q}});
  if(!total&&!a.close)fail('Para registrar nada, selecciona cerrar el pedido sin entregar.');
  r.closed=!!a.close||r.lines.every(l=>l.delivered>=l.quantity);r.dispatches.push({id:move.id,date:move.date,at:move.at,dispatcher:a.dispatcher.trim(),note:move.note,quantities});move.kind='despacho';move.reference=r.number;move.requestId=r.id;return true;
 }
 if(a.type==='eliminar-orden'){
  const r=requests.find(r=>r.id===a.requestId);if(!r)fail('La orden no existe.');
  if(typeof a.deletedBy!=='string'||!a.deletedBy.trim()||a.deletedBy.length>200)fail('No se pudo identificar al administrador.');
  const restocks=orderRestocks(s,r,convert);
  for(const line of restocks){const i=s.ingredients.find(i=>i.id===line.ingredientId)!;adjust(i,i.stock+line.quantity)}
  for(const d of r.dispatches){if(d.reversed)continue;s.movements.find(m=>m.id===d.id)!.reversed=true;d.reversed=true;}
  r.closed=true;r.deleted={at:move.at,date:move.date,by:a.deletedBy.trim(),actorId:String(a.actorId||''),note:move.note,movementId:move.id};
  move.reference=r.number;move.requestId=r.id;return true;
 }
 return false;
}
