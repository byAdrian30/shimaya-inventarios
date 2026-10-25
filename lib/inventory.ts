import {applyWorkflow,type AreaItem,type Requisition} from './requests.ts';
import {reconcileCatalog} from './catalog-reconciliation.ts';
import {canonicalUnit,units,unitFactor} from './units.ts';
import {applyReceipt} from './receiving.ts';
export {canonicalUnit,units,unitLabel} from './units.ts';
export type Ingredient={id:string;name:string;category:string;unit:string;stock:number;minimum:number;configured?:boolean;aliases?:string;noOrder?:boolean;sourceUnit?:string;catalogId?:string;unitIssue?:string;legacyUnits?:{unit:string;factor:number}[];areasSource?:string;unitNote?:string;stockBasis?:'piece';purchasePackSize?:number};
export type OrderLine={ingredientId:string;quantity:number;unit:string};
export type ReviewLine={raw:string;ingredientId:string;quantity:number;unit:string;checked:boolean;warning:string;sourcePhoto?:string;sourceColumn?:string;sourceBox?:{x:number;y:number;width:number;height:number};needsReview?:boolean;sourceCrop?:string};
export type Movement={id:string;date:string;at:string;kind:string;note:string;reference:string;photos:string[];photoColumns?:{hash:string;dayIndex:number}[];lines:{ingredientId:string;name:string;unit:string;delta:number;before:number;after:number}[];orders?:{name:string;quantity:number}[];reversed?:boolean;requestId?:string;document?:{hash:string;name:string}};
export type State={ingredients:Ingredient[];movements:Movement[];areaItems?:AreaItem[];requests?:Requisition[];catalogVersion?:string;areasVersion?:string;launchResetVersion?:string;launchResetAt?:string;stockLoadVersion?:string;stockLoadAt?:string;addedItemsVersion?:string};
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export const round=(n:number)=>Math.round(n*1e6)/1e6;
export const configured=(i:Ingredient)=>i.configured!==false&&!!i.unit&&!i.unitIssue;
export function isTrago(name: string, category?: string): boolean {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase().trim();
  if (c === 'tragos' || c === 'licores' || c.includes('trago') || c.includes('licor')) return true;
  return /\b(soju|sake|cusqueña|asahi|kirin|orion|cerveza|licor de arroz|vodka|gin|ron|pisco|whisky|tequila)\b/i.test(n) || /^blend de\s+/i.test(n);
}
export function emptyState():State{return {ingredients:[],movements:[]}}
export function withCatalog(s:State):State{return reconcileCatalog(structuredClone(s))}
function fail(s:string):never{throw Error(s)}
function num(n:unknown,positive=false){if(typeof n!=='number'||!Number.isFinite(n)||n<0||(positive&&n<=0)||n>1e8)fail('Ingresa una cantidad válida.');const value=round(n as number);if(positive&&value===0)fail('La cantidad es demasiado pequeña.');return value}
function label(n:unknown){if(typeof n!=='string'||!n.trim()||n.length>200)fail('Ingresa un nombre válido (hasta 200 caracteres).');return (n as string).trim()}
export function convert(amount:number,from:string,to:string,ingredient?:Ingredient){const legacy=ingredient?.legacyUnits?.find(u=>canonicalUnit(u.unit)===canonicalUnit(from));return num(amount*(legacy&&canonicalUnit(to)===canonicalUnit(ingredient!.unit)?legacy.factor:unitFactor(from,to)),true)}
export function deductions(s:State,orders:OrderLine[]){if(!Array.isArray(orders)||!orders.length||orders.length>500)fail('Agrega al menos un insumo.');const totals:Record<string,number>={};for(const o of orders){const i=s.ingredients.find(i=>i.id===o.ingredientId);if(!i)fail('Selecciona un insumo del catálogo.');if(!configured(i))fail('Configura la unidad y el stock inicial de '+i.name+'.');const amount=convert(num(o.quantity,true),o.unit,i.unit,i);totals[i.id]=round((totals[i.id]||0)+amount)}return Object.entries(totals).map(([id,amount])=>{const ingredient=s.ingredients.find(i=>i.id===id)!;return {ingredient,amount,remaining:round(ingredient.stock-amount)}})}
export function applyAction(current:State,a:any):State{
 const s=structuredClone(current),id=()=>crypto.randomUUID();const date=String(a.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('Selecciona una fecha válida.');
 const move:Movement={id:a.operationId||id(),date,at:new Date().toISOString(),kind:a.type,note:String(a.note||'').slice(0,500),reference:String(a.reference||'').trim().slice(0,100),photos:[],lines:[]};if(typeof move.id!=='string'||move.id.length>100)fail('Operación inválida.');if(s.movements.some(m=>m.id===move.id))return s;
 // Los despachos registran faltantes; entradas y anulaciones pueden regularizarlos por partes.
 const allowNegative=['despachar','entrada','recepcion','revertir','eliminar-orden'].includes(a.type);
 function adjust(i:Ingredient,next:number){next=round(next);if(!Number.isFinite(next)||next<(allowNegative?-1e8:0)||next>1e8)fail((allowNegative?'Saldo de stock fuera del rango permitido: ':'Stock insuficiente o cantidad inválida: ')+i.name);const existing=move.lines.find(l=>l.ingredientId===i.id);if(existing){existing.after=next;existing.delta=round(next-existing.before)}else move.lines.push({ingredientId:i.id,name:i.name,unit:i.unit,delta:round(next-i.stock),before:i.stock,after:next});i.stock=next;}
 if(applyWorkflow(s,a,move,adjust,convert,canonicalUnit)){
 }else if(a.type==='recepcion'){
 applyReceipt(s,a,move,adjust);
 }else if(a.type==='ingredient'){
 const name=label(a.name);if(s.ingredients.some(i=>normalize(i.name)===normalize(name)&&i.id!==a.id))fail('Ya existe un insumo con ese nombre.');let i=s.ingredients.find(i=>i.id===a.id);if(a.id&&!i)fail('Insumo inexistente.');if(!i){i={id:id(),name,category:'Otros',unit:'',stock:0,minimum:0,configured:false};s.ingredients.push(i)}const setup=!configured(i);i.name=name;i.category=String(a.category||'Sin clasificar').slice(0,80);i.minimum=num(a.minimum);i.aliases=String(a.aliases||'').slice(0,1000);i.noOrder=!!a.noOrder;
 if(setup||i.unitIssue){const unit=canonicalUnit(a.unit||'');if(!unit)fail('Selecciona la unidad de control.');if(i.catalogId&&unit!==canonicalUnit(i.sourceUnit||''))fail('Usa la unidad indicada por el catálogo: '+i.sourceUnit);i.unit=unit;adjust(i,num(a.stock));i.configured=true;i.unitIssue='';i.unitNote='';move.kind='apertura';move.note='Stock inicial';}else return s;
 }else if(a.type==='importar'){
 if(!Array.isArray(a.items)||!a.items.length||a.items.length>2000)fail('Selecciona los insumos a importar.');const seen=new Set<string>();for(const item of a.items){const name=label(item.name),key=normalize(name);if(seen.has(key))fail('Hay un nombre repetido en la importación: '+name);seen.add(key);let i=s.ingredients.find(i=>normalize(i.name)===key);if(!i){i={id:id(),name,category:'Sin clasificar',unit:'',stock:0,minimum:0,configured:false,aliases:'',noOrder:name.startsWith('(NO PEDIR)')};s.ingredients.push(i)}if(item.category)i.category=String(item.category).slice(0,80);if(item.minimum!==undefined)i.minimum=num(item.minimum);if(item.stock===undefined&&item.unit&&!configured(i)){const unit=canonicalUnit(item.unit);if(!unit)fail('Unidad inválida para '+name);i.unit=unit}if(item.stock!==undefined){const unit=canonicalUnit(item.unit||i.unit);if(!unit)fail('Falta unidad para el stock de '+name);let amount=num(item.stock);if(configured(i)&&unit!==i.unit){if(amount===0){convert(1,unit,i.unit)}else amount=convert(amount,unit,i.unit)}else i.unit=unit;adjust(i,amount);i.configured=true;}}
 move.note='Importación revisada · '+a.items.length+' insumos';
 }else if(['conteo','entrada','merma'].includes(a.type)){
 if(!Array.isArray(a.lines)||!a.lines.length)fail('Ingresa las cantidades.');const seen=new Set();for(const l of a.lines){const i=s.ingredients.find(i=>i.id===l.ingredientId);if(!i||seen.has(i.id))fail('Insumo inválido o repetido.');if(!configured(i))fail('Configura primero la unidad de '+i.name);seen.add(i.id);const amount=num(l.amount,a.type!=='conteo');adjust(i,a.type==='conteo'?amount:a.type==='entrada'?i.stock+amount:i.stock-amount)}
 }else if(a.type==='pedido'){
 if(!move.reference)fail('Ingresa una referencia de la salida.');if(s.movements.some(m=>m.kind==='pedido'&&normalize(m.reference)===normalize(move.reference)))fail('Esta referencia ya se registró. Usa una referencia única, por ejemplo fecha + documento.');if(!Array.isArray(a.photos)||a.photos.some((p:any)=>typeof p!=='string'||!/^[a-f0-9]{64}$/.test(p)))fail('Fotografía inválida.');move.photos=[...new Set<string>(a.photos)];move.photoColumns=move.photos.map(hash=>({hash,dayIndex:Array.isArray(a.photoColumns)?Number(a.photoColumns.find((p:any)=>p.hash===hash)?.dayIndex||0):0}));if(move.photoColumns.some(p=>!Number.isInteger(p.dayIndex)||p.dayIndex<0||p.dayIndex>7))fail('Columna de foto inválida.');if(s.movements.some(m=>m.kind==='pedido'&&m.photos.some(hash=>move.photos.includes(hash)&&(!m.photoColumns||m.photoColumns.find(p=>p.hash===hash)?.dayIndex===move.photoColumns!.find(p=>p.hash===hash)?.dayIndex))))fail('Esta foto ya fue descontada para ese día.');for(const x of deductions(s,a.orders))adjust(x.ingredient,x.remaining);
 }else if(a.type==='revertir'){
 const old=s.movements.find(m=>m.id===a.id);if(!old||old.reversed||old.kind==='reversion'||old.kind==='eliminar-orden'||!old.lines.length)fail('Este movimiento no se puede revertir.');for(const l of old.lines){const i=s.ingredients.find(i=>i.id===l.ingredientId);if(!i)fail('Insumo inexistente.');const delta=l.delta===0?0:Math.sign(l.delta)*convert(Math.abs(l.delta),l.unit,i.unit,i);adjust(i,i.stock-delta)}if(old.requestId){const r=s.requests?.find(r=>r.id===old.requestId),d=r?.dispatches.find(d=>d.id===old.id);if(!r||r.deleted||!d)fail('No se encontró un despacho activo asociado.');for(const q of d.quantities){const l=r.lines.find(l=>l.itemId===q.itemId)!;l.delivered=round(l.delivered-q.quantity)}d.reversed=true;r.closed=r.lines.every(l=>l.delivered>=l.quantity);}old.reversed=true;move.kind='reversion';move.note='Reversión: '+(old.reference||old.note||old.kind);
 }else fail('Operación desconocida.');s.movements.unshift(move);return s;
}
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function numberText(s:string){if(!/^\d+(?:[.,]\d+)?$/.test(s))return 0;if(/[.,]\d{3}$/.test(s))return 0;return Number(s.replace(',','.'))}
export function parseOrders(text:string,ingredients:Ingredient[]):ReviewLine[]{
 return text.split(/\r?\n/).filter(l=>l.trim()).map(raw=>{
 const f=fold(raw);let matches:{i:Ingredient;start:number;end:number;length:number}[]=[];
 for(const i of ingredients){const aliases=[i.name,...(i.aliases||'').split(','),i.name.replace(/^\(NO PEDIR\)\s*/i,'')];for(const name of aliases){const tokens=normalize(name).split(' ').filter(Boolean);if(!tokens.length)continue;const re=new RegExp('(?<![a-z0-9])'+tokens.join('[^a-z0-9]*')+'(?![a-z0-9])','i');const m=re.exec(f);if(m){matches.push({i,start:m.index,end:m.index+m[0].length,length:tokens.join('').length})}}}
 matches=matches.sort((a,b)=>b.length-a.length);const best=matches[0];if(!best)return {raw,ingredientId:'',quantity:0,unit:'',checked:false,warning:'Relaciona esta línea con un insumo.'};
 const ambiguous=matches.some(m=>m.i.id!==best.i.id&&(m.start<best.start||m.end>best.end));const rem=(f.slice(0,best.start)+' '+f.slice(best.end)).replace(/^\s*[|:;\t-]+|[|:;\t-]+\s*$/g,'').trim();
 // Números de presentación (por ejemplo X 2LT o PACK X5) quedan dentro del nombre y nunca son cantidades de salida.
 const qty=rem.match(/^\s*(?:x\s*)?(\d+(?:[.,]\d+)?)\s*(?:([a-záéíóúñ]+))?\s*$/i)||rem.match(/^\s*([a-z]+)\s+(\d+(?:[.,]\d+)?)\s*$/i);
 let quantity=0,unit='';if(qty){const numeric=/^\d/.test(qty[1]);quantity=numberText(numeric?qty[1]:qty[2]);const word=numeric?qty[2]:qty[1];unit=word?canonicalUnit(word):best.i.unit;if(word==='x')unit=best.i.unit;}
 let warning=ambiguous?'Hay varios insumos en una línea. Sepáralos.':!qty||!quantity?'Revisa la cantidad: no se interpretó con seguridad.':!unit?'Selecciona la unidad.':!configured(best.i)?'Falta configurar stock y unidad del insumo.':'';
 if(!warning){try{convert(quantity,unit,best.i.unit)}catch{warning='Unidad incompatible con el inventario.'}}
 return {raw,ingredientId:best.i.id,quantity,unit,checked:!warning,warning};
 });
}
