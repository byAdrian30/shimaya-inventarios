import {env} from 'cloudflare:workers';
import {withCatalog,type State} from './inventory.ts';
import {withAddedItems} from './added-items.ts';
import {catalogVersion} from './catalog-source.ts';
import {areasVersion} from './areas-source.ts';
import {addedItemsVersion} from './added-items.ts';
import type {CostOverride} from './valuation-types.ts';
import {hasSharedToken} from './share-token.ts';
export {configuredShareToken} from './share-token.ts';

export const sharedHeaders={
 'Cache-Control':'private, no-store',
 'Vary':'Authorization',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
 'X-Robots-Tag':'noindex, nofollow, noarchive',
};
export class SharedAccessError extends Error{
 status:number;
 constructor(message:string,status:number){super(message);this.status=status}
}
export async function sharedOwner(request:Request){
 if(!hasSharedToken(request))throw new SharedAccessError('El enlace de consulta no es válido o está desactivado.',403);
 // El enlace solo da acceso al espacio original; no acepta un propietario enviado por el visitante.
 const row=await env.DB!.prepare('SELECT data FROM inventory_state WHERE id=?').bind('shimaya-workspace-owner-v1').first<{data:string}>();
 const ownerId=row?JSON.parse(row.data).ownerId:undefined;
 if(typeof ownerId!=='string'||!ownerId)throw new SharedAccessError('El inventario todavía no está disponible.',503);
 return ownerId;
}
export async function sharedInventory(ownerId:string){
 const row=await env.DB!.prepare('SELECT revision,data FROM inventory_state WHERE id=?').bind(ownerId).first<{revision:number;data:string}>();
 if(!row)throw new SharedAccessError('El inventario todavía no está disponible.',503);
 const current:State=JSON.parse(row.data);
 // Las visitas de consulta no escriben ni migran registros en la base de datos.
 const state=current.catalogVersion===catalogVersion&&current.areasVersion===areasVersion&&current.addedItemsVersion===addedItemsVersion?current:withAddedItems(withCatalog(current));
 return {state,revision:row.revision};
}
export async function sharedCosts(ownerId:string){
 const row=await env.DB!.prepare('SELECT revision,data FROM inventory_costs WHERE owner_id=?').bind(ownerId).first<{revision:number;data:string}>();
 return {revision:row?.revision||0,overrides:row?(JSON.parse(row.data).overrides||[]) as CostOverride[]:[]};
}
export function sharedFailure(error:unknown){
 return Response.json({error:error instanceof SharedAccessError?error.message:'No se pudo cargar la consulta. Intenta actualizar los datos.'},{status:error instanceof SharedAccessError?error.status:500,headers:sharedHeaders});
}
export function rejectSharedMutation(){
 return Response.json({error:'Este acceso es de solo lectura. No permite modificar datos.'},{status:405,headers:{...sharedHeaders,Allow:'GET, HEAD'}});
}
