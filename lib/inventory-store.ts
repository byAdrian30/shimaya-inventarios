import {env} from 'cloudflare:workers';
import {emptyState,withCatalog,type State} from './inventory.ts';
import {catalogVersion} from './catalog-source.ts';
import {areasVersion} from './areas-source.ts';
import {dispatchIngredientId} from './requests.ts';
import {addedItemsVersion,withAddedItems} from './added-items.ts';
export async function readOnlyInventoryFor(ownerId:string){
 const row=await env.DB!.prepare('SELECT revision,data FROM inventory_state WHERE id=?').bind(ownerId).first<{revision:number;data:string}>();
 if(!row)throw Error('No se pudo cargar el inventario.');
 const current:State=JSON.parse(row.data);
 const state=current.catalogVersion===catalogVersion&&current.areasVersion===areasVersion&&current.addedItemsVersion===addedItemsVersion?current:withAddedItems(withCatalog(current));
 return {revision:row.revision,state};
}
export async function inventoryFor(ownerId:string){
 await env.DB!.prepare('INSERT OR IGNORE INTO inventory_state(id,revision,data) VALUES(?,0,?)').bind(ownerId,JSON.stringify(emptyState())).run();
 for(let attempt=0;attempt<3;attempt++){
  const row=await env.DB!.prepare('SELECT revision,data FROM inventory_state WHERE id=?').bind(ownerId).first<{revision:number;data:string}>();if(!row)throw Error('No se pudo cargar el inventario.');
  const current:State=JSON.parse(row.data);if(current.catalogVersion===catalogVersion&&current.areasVersion===areasVersion&&current.addedItemsVersion===addedItemsVersion)return {revision:row.revision,state:current};
  const state=withAddedItems(withCatalog(current)),updated=await env.DB!.prepare('UPDATE inventory_state SET data=?,revision=revision+1 WHERE id=? AND revision=? RETURNING revision').bind(JSON.stringify(state),ownerId,row.revision).first<{revision:number}>();
  if(updated)return {revision:updated.revision,state};
 }
 throw Error('El inventario cambió en otro dispositivo. Actualiza los datos.');
}
export function visibleInventory(state:State,role:string,userId:string,area=''):State{
 if(role==='admin')return state;
 if(role==='dispatch'||role==='operator'){
  const requests=(state.requests||[]).filter(r=>!r.deleted&&(!area||r.area===area)),itemIds=new Set(requests.flatMap(r=>r.lines.map(l=>l.itemId))),areaItems=(state.areaItems||[]).filter(i=>itemIds.has(i.id)||role==='operator'&&i.active!==false&&(!area||i.area===area));
  const stockIds=new Set(requests.flatMap(r=>r.lines.map(l=>dispatchIngredientId(state,l)))),ingredientIds=new Set([...stockIds,...(role==='operator'?areaItems.flatMap(i=>[i.ingredientId,...(i.ingredientOptions||[])]):[])]);
  return {...state,ingredients:state.ingredients.filter(i=>ingredientIds.has(i.id)).map(i=>({...i,stock:stockIds.has(i.id)?i.stock:0,minimum:0})),areaItems,requests,movements:[]};
 }
 return {...state,ingredients:state.ingredients.map(i=>({...i,stock:0,minimum:0})),areaItems:state.areaItems?.filter(i=>i.active!==false&&(!area||i.area===area)),requests:state.requests?.filter(r=>!r.deleted&&r.actorId===userId&&(!area||r.area===area)),movements:[]};
}
