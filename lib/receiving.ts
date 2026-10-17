import type {State,Ingredient,Movement} from './inventory.ts';
import {canonicalUnit,unitFactor} from './units.ts';
import {TEAM_AREAS} from './team-access.ts';
const fold=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
const round=(n:number)=>Math.round(n*1e6)/1e6;
function fail(message:string):never{throw Error(message)}
export type ReceiptRow={raw:string;name:string;ingredientId:string;quantity:number;unit:string;selected:boolean;warning:string;isNew:boolean;area?:string};
export function receiptAmount(i:Ingredient,quantity:number,unit:string){
 if(!Number.isFinite(quantity)||quantity<=0||quantity>1e8)fail('Ingresa una cantidad recibida válida.');
 const from=canonicalUnit(unit),to=canonicalUnit(i.unit);if(!from||!to)fail('Selecciona una unidad válida.');
 const amount=i.stockBasis==='piece'&&from==='paquete'?quantity*(i.purchasePackSize||1):quantity*unitFactor(from,to);
 if(!Number.isFinite(amount)||amount<=0||amount>1e8)fail('La cantidad recibida excede el rango permitido.');return round(amount);
}
function baseName(s:string){return fold(s).replace(/\b(?:x|de|por|paquete|paquetes|pack|unidad|unidades|bolsa|caja|pote|botella)\b/g,' ').replace(/\d+(?:[.,]\d+)?\s*(?:kg|gr|g|ml|lt|l|und|u|porciones|laminas)?\b/g,' ').replace(/\s+/g,' ').trim()}
export function matchReceiptItem(name:string,ingredients:Ingredient[]){
 const key=fold(name),base=baseName(name);if(!key)return [];
 const exact=ingredients.filter(i=>fold(i.name)===key);if(exact.length)return exact;
 const alias=ingredients.filter(i=>(i.aliases||'').split(',').some(alias=>fold(alias)===key));if(alias.length)return alias;
 const candidates=ingredients.map(i=>({i,names:[i.name,...(i.aliases||'').split(',')].map(baseName)}));
 const same=candidates.filter(({names})=>names.includes(base)).map(({i})=>i);if(same.length)return same;
 const tokens=base.split(' ').filter(t=>t.length>=3);if(!tokens.length)return [];
 return candidates.filter(({names})=>names.some(n=>tokens.every(t=>n.split(' ').some(w=>w===t)))).map(({i})=>i);
}
const number=(s:string)=>{let value=s.trim().replace(/\s/g,'');if(value.includes(',')&&value.includes('.')){if(value.lastIndexOf(',')>value.lastIndexOf('.'))value=value.replaceAll('.','').replace(',','.');else value=value.replaceAll(',','')}else value=value.replace(',','.');return Number(value)};
export function parseReceivingText(text:string,ingredients:Ingredient[]):ReceiptRow[]{
 const result:ReceiptRow[]=[];
 let columns:{name:number;quantity:number;unit:number}|undefined;
 for(const raw of text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)){
  const cells=raw.split(/\s*\|\s*|\t+|\s{2,}/).filter(s=>s.trim());
  const nameColumn=cells.findIndex(cell=>/^(?:descripcion|producto|insumo|detalle)\b/.test(fold(cell))),quantityColumn=cells.findIndex(cell=>/^(?:cantidad|cant|cant\.|qty)$/.test(fold(cell))),unitColumn=cells.findIndex(cell=>/^(?:unidad|unid|und|um|u m)$/.test(fold(cell)));
  if(nameColumn>=0&&quantityColumn>=0){columns={name:nameColumn,quantity:quantityColumn,unit:unitColumn};continue;}
  if(/^(?:subtotal|total|igv|ruc|fecha|pagina|pag\.|cliente|direccion|proveedor|documento|guia|factura|boleta|observacion|descripcion|cantidad|codigo)\b/i.test(fold(raw))&&!/\b(?:salsa|paquete|bolsa|aceite)\b/i.test(raw))continue;
  let name='',quantity=0,unit='';
  if(columns&&cells[columns.name]&&/^\d+(?:[.,]\d+)*$/.test(cells[columns.quantity]?.trim()||'')){name=cells[columns.name].trim();quantity=number(cells[columns.quantity]);unit=canonicalUnit(cells[columns.unit]||'');}
  if(!name&&cells.length>=2){
   const numeric=cells.map((cell,index)=>({cell,index})).filter(({cell})=>/^\d+(?:[.,]\d+)*$/.test(cell.trim()));
   const product=cells.find(cell=>/[a-záéíóúñ]{3}/i.test(cell)&&!canonicalUnit(cell.trim()));
   if(product&&numeric.length===1){name=product.trim();quantity=number(numeric[0].cell);unit=cells.map(c=>canonicalUnit(c.trim())).find(Boolean)||'';}
  }
  if(!name){
   const last=raw.match(/^(.+?)\s+(\d+(?:[.,]\d+)*)\s*(kg|kgs|g|gr|lt|l|ml|und|uds|unidades|unidad|paquetes|paquete|packs|pack|bolsas|bolsa|cajas|caja|rollos|rollo)?\s*$/i);
   const first=raw.match(/^(\d+(?:[.,]\d+)*)\s+(?:(kg|kgs|g|gr|lt|l|ml|und|uds|unidades|unidad|paquetes|paquete|packs|pack|bolsas|bolsa|cajas|caja|rollos|rollo)\s+)?(.+)$/i);
   if(first){name=first[3].trim();quantity=number(first[1]);unit=canonicalUnit(first[2]||'')}
   else if(last){name=last[1].trim();quantity=number(last[2]);unit=canonicalUnit(last[3]||'')}
  }
  if(!name||!/[a-záéíóúñ]{3}/i.test(name))continue;
  // An unlabelled presentation size is never treated as a delivered quantity.
  if(/\b(?:x|por)\s*$/i.test(name)){result.push({raw,name,ingredientId:'',quantity:0,unit:'und',selected:false,warning:'Revisa la cantidad: parece parte del nombre de la presentación.',isNew:false});continue;}
  const matches=matchReceiptItem(name,ingredients),ingredient=matches.length===1?matches[0]:undefined;
  const isNew=matches.length===0;let warning=matches.length>1?'Elige la presentación del inventario.':isNew?'Producto nuevo: revisa el nombre y la unidad.':'';
  if(ingredient){
   if(!unit)unit=ingredient.stockBasis==='piece'&&/\b(?:paquete|paqt|pack)\b/i.test(name)?'paquete':ingredient.unit;
   try{receiptAmount(ingredient,quantity,unit)}catch{warning='Revisa la cantidad y la unidad de entrada.'}
  }else unit=unit||'und';
  if(!Number.isFinite(quantity)||quantity<=0)warning='Revisa la cantidad recibida.';
  result.push({raw,name,ingredientId:ingredient?.id||'',quantity:Number.isFinite(quantity)?quantity:0,unit,selected:!warning,warning,isNew});
 }
 if(result.length>500)throw Error('El documento contiene más de 500 insumos. Divídelo en archivos más pequeños.');
 return result;
}
export function applyReceipt(s:State,a:any,movement:Movement,adjust:(i:Ingredient,stock:number)=>void){
 if(typeof a.reference!=='string'||!a.reference.trim()||a.reference.length>100)fail('Ingresa el número de guía o documento.');
 if(s.movements.some(m=>m.kind==='recepcion'&&fold(m.reference)===fold(a.reference)))fail('Este documento de ingreso ya se registró.');
 if(a.document){if(!/^[a-f0-9]{64}$/.test(a.document.hash)||typeof a.document.name!=='string'||!a.document.name||a.document.name.length>180)fail('Documento de ingreso inválido.');if(s.movements.some(m=>m.document?.hash===a.document.hash))fail('Este PDF ya se registró.');movement.document={hash:a.document.hash,name:a.document.name};}
 if(!Array.isArray(a.lines)||!a.lines.length||a.lines.length>500)fail('Selecciona los insumos recibidos.');
 for(const [index,line] of a.lines.entries()){
  let ingredient=s.ingredients.find(i=>i.id===line.ingredientId);
  if(!ingredient&&line.isNew){
   const name=typeof line.name==='string'?line.name.trim():'';if(!name||name.length>200)fail('Revisa el nombre del producto nuevo.');
   ingredient=s.ingredients.find(i=>fold(i.name)===fold(name));
   if(!ingredient){const unit=canonicalUnit(line.unit||'');if(!unit)fail('Selecciona la unidad del producto nuevo.');ingredient={id:'receipt-'+movement.id+'-'+index,name,category:'Otros',unit,stock:0,minimum:0,configured:true,aliases:'',noOrder:false};s.ingredients.push(ingredient)}
   if(line.area){if(!TEAM_AREAS.includes(line.area))fail('Selecciona un área válida.');const itemId='receipt-area-'+ingredient.id+'-'+fold(line.area);s.areaItems??=[];if(!s.areaItems.some(i=>i.id===itemId))s.areaItems.push({id:itemId,area:line.area,group:'Otros insumos',name:ingredient.name,referenceUnit:ingredient.unit,source:'INGRESO DE MERCADERÍA',ingredientId:ingredient.id,active:true,linkReviewed:true});}
  }
  if(!ingredient)fail('Selecciona el insumo del inventario.');
  if(!ingredient.unit||ingredient.unitIssue)fail('Revisa la unidad de '+ingredient.name);
  const amount=receiptAmount(ingredient,line.quantity,line.unit||ingredient.unit);adjust(ingredient,ingredient.stock+amount);ingredient.configured=true;
 }
 movement.kind='recepcion';movement.note=String(a.note||'Ingreso de mercadería desde Lima').slice(0,500);
}
