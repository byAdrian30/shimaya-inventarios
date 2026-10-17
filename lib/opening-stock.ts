import {withCatalog,canonicalUnit,normalize,round,type State,type Movement} from './inventory.ts';
import {openingStockSource,openingStockVersion} from './opening-stock-source.ts';
import {catalogSource} from './catalog-source.ts';
function findIngredient(state:State,id:string,name?:string){const official=catalogSource.find(i=>i.id===id)?.name;return state.ingredients.find(i=>i.id===id||i.catalogId===id)||state.ingredients.find(i=>normalize(i.name)===normalize(name||official||''))||(id.startsWith('area-stock-')?state.ingredients.find(i=>normalize(i.name).replaceAll(' ','')===id.slice(11)):undefined);}
export function applyOpeningStock(current:State,at:string):State{
 if(current.stockLoadVersion===openingStockVersion)return structuredClone(current);
 const state=withCatalog(current),totals=new Map<string,number>();
 for(const row of openingStockSource){
  let ingredient=findIngredient(state,row.ingredientId,row.name);
  if(!ingredient){if(!row.name)throw Error('No se encontró el insumo de la lista: '+row.input);ingredient={id:row.ingredientId,name:row.name,category:row.category||'Otros',unit:row.unit||'und',stock:0,minimum:0,configured:true};state.ingredients.push(ingredient)}
  totals.set(ingredient.id,round((totals.get(ingredient.id)||0)+row.quantity));
  if(normalize(row.input)!==normalize(ingredient.name))ingredient.aliases=[...new Set([...(ingredient.aliases||'').split(',').map(s=>s.trim()).filter(Boolean),row.input])].join(',').slice(0,1000);
 }
 const movement:Movement={id:openingStockVersion,date:'2026-10-11',at,kind:'apertura',note:'Stock físico de almacén informado por Adrian. Insumos no incluidos: stock 0.',reference:'STOCK-11-10-2026',photos:[],lines:[]};
 for(const ingredient of state.ingredients){
  const before=ingredient.stock;
  ingredient.unit=canonicalUnit(ingredient.sourceUnit||ingredient.unit)||'und';ingredient.stock=totals.get(ingredient.id)||0;
  ingredient.configured=true;ingredient.unitIssue='';
  if(ingredient.unitNote?.startsWith('El Excel de áreas'))ingredient.unitNote='Control por unidad.';
  if((ingredient.catalogId||ingredient.id)==='catalog-092'){ingredient.stockBasis='piece';ingredient.purchasePackSize=30;ingredient.unitNote='Stock y pedidos en piezas sueltas. Un paquete de origen contiene 30 piezas.';}
  if((ingredient.catalogId||ingredient.id)==='catalog-068')ingredient.unitNote='Stock y pedidos en paquetes de 20 láminas.';
  if(before!==ingredient.stock)movement.lines.push({ingredientId:ingredient.id,name:ingredient.name,unit:ingredient.unit,before,after:ingredient.stock,delta:round(ingredient.stock-before)});
 }
 // Keep original rows, names, historical orders and all shared inventory links.
 for(const item of state.areaItems||[]){const ingredient=state.ingredients.find(i=>i.id===item.ingredientId);if(ingredient)item.referenceUnit=ingredient.sourceUnit||ingredient.unit;}
 for(const [id,area] of [['stock-gasbutano','Makis'],['stock-katsuahumada','Fritura'],['stock-blenddemargarita','Barra']]){
  const name=openingStockSource.find(r=>r.ingredientId===id)?.name,ingredient=findIngredient(state,id,name)!;const itemId='opening-area-'+id;
  if(!state.areaItems!.some(i=>i.id===itemId))state.areaItems!.push({id:itemId,area,group:'Otros insumos',name:ingredient.name,sourceName:ingredient.name,referenceUnit:ingredient.unit,source:'STOCK DE ALMACÉN',ingredientId:ingredient.id,active:true,linkReviewed:true});
 }
 state.movements.unshift(movement);state.stockLoadVersion=openingStockVersion;state.stockLoadAt=at;
 return state;
}
export function openingStockSummary(state:State){
 const rows=openingStockSource.map(row=>{const i=findIngredient(state,row.ingredientId,row.name)!;return {input:row.input,quantity:row.quantity,ingredientId:i.id,name:i.name,unit:i.unit,stock:i.stock,stockBasis:i.stockBasis||'presentation'}});
 return {version:state.stockLoadVersion,loadedAt:state.stockLoadAt,sourceRows:rows.length,ingredients:state.ingredients.length,withStock:state.ingredients.filter(i=>i.stock!==0).length,zeroStock:state.ingredients.filter(i=>i.stock===0).length,unconfigured:state.ingredients.filter(i=>!i.unit||i.configured===false||i.unitIssue).length,rows};
}
