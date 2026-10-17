// Servidor: los precios nunca se añaden al estado compartido de Pedido y Despacho.
import {normalize,round,type State,type Ingredient} from './inventory.ts';
import {invoiceCostSource,invoiceCostVersion,invoiceDocuments} from './invoice-cost-source.ts';
import type {CostOverride,Valuation,ValuationRow} from './valuation-types.ts';
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const costBasis=(i:Ingredient)=>i.unit+'|'+(i.stockBasis||'presentation');
export function inventoryValuation(state:State,overrides:CostOverride[]=[],revision=0,inventoryRevision=0):Valuation{
 const sources=new Map<string,typeof invoiceCostSource[number]>();
 for(const row of invoiceCostSource){
  const i=state.ingredients.find(i=>i.id===row.ingredientKey||i.catalogId===row.ingredientKey)||(row.ingredientKey.startsWith('area-stock-')?state.ingredients.find(i=>normalize(i.name).replaceAll(' ','')===row.ingredientKey.slice(11)):undefined);
  if(!i)continue;
  const old=sources.get(i.id);if(!old||old.referenceOnly&&!row.referenceOnly||old.referenceOnly===row.referenceOnly&&row.date>old.date)sources.set(i.id,row);
 }
 const rows:ValuationRow[]=state.ingredients.map(i=>{
  const source=sources.get(i.id),saved=overrides.find(o=>o.ingredientId===i.id),manual=saved?.basis===costBasis(i)?saved:undefined;
  const factor=source?.code==='10167'&&i.stockBasis!=='piece'?1:source?.stockFactor;
  const gross=manual?manual.gross:source?round(source.price/factor!):null,net=gross===null?null:round(gross/1.18),stock=Math.max(0,i.stock);
  return {ingredientId:i.id,name:i.name,category:i.category,unit:i.stockBasis==='piece'?'Pieza suelta':(i.catalogId||i.id)==='catalog-068'?'Paquete de 20 láminas':i.sourceUnit||i.unit,basis:costBasis(i),stock:i.stock,unitGross:gross,unitNet:net,valueGross:gross===null?null:money(stock*gross),valueNet:gross===null?null:money(stock*gross/1.18),shortageGross:gross===null?null:money(Math.max(0,-i.stock)*gross),invoice:manual?'Costo manual':source?.invoice||'',date:manual?.updatedAt.slice(0,10)||source?.date||'',sourceName:source?.name||'',sourceUnit:source?.unit||'',sourcePrice:source?.price??null,conversionNote:manual?'':source?.conversionNote||'',referenceOnly:!manual&&!!source?.referenceOnly,manual:!!manual,note:manual?.note||(!source?'No figura con precio en estos documentos. Puedes registrar el costo manual.':'')};
 });
 const sum=(key:'valueGross'|'valueNet'|'shortageGross')=>money(rows.reduce((n,r)=>n+(r[key]??0),0));
 const gross=sum('valueGross'),net=sum('valueNet');
 return {revision,inventoryRevision,version:invoiceCostVersion,rows,documents:invoiceDocuments.map(d=>({invoice:d.invoice,date:d.date,lines:d.lines,total:d.total})),summary:{gross,net,tax:money(gross-net),shortageGross:sum('shortageGross'),priced:rows.filter(r=>r.unitGross!==null).length,missing:rows.filter(r=>r.unitGross===null).length,withStockPriced:rows.filter(r=>r.stock>0&&r.unitGross!==null).length,withStockMissing:rows.filter(r=>r.stock>0&&r.unitGross===null).length,references:rows.filter(r=>r.stock>0&&r.referenceOnly).length,negative:rows.filter(r=>r.stock<0).length}};
}
export function editCost(overrides:CostOverride[],state:State,action:unknown,at:string){
 const a=action as {ingredientId?:unknown;gross?:unknown;basis?:unknown;note?:unknown};
 if(typeof a?.ingredientId!=='string')throw Error('Selecciona un insumo.');
 const ingredient=state.ingredients.find(i=>i.id===a.ingredientId);if(!ingredient)throw Error('El insumo no existe.');
 if(a.basis!==costBasis(ingredient))throw Error('La unidad cambió. Actualiza el inventario antes de registrar el costo.');
 const next=overrides.filter(o=>o.ingredientId!==ingredient.id);
 if(a.gross===null)return next;
 if(typeof a.gross!=='number'||!Number.isFinite(a.gross)||a.gross<0||a.gross>1e8)throw Error('Ingresa un costo válido en soles, desde 0 hasta 100 millones.');
 if(typeof a.note!=='string'||a.note.length>500)throw Error('La nota admite hasta 500 caracteres.');
 next.push({ingredientId:ingredient.id,gross:round(a.gross),basis:costBasis(ingredient),note:a.note.trim(),updatedAt:at});return next;
}
