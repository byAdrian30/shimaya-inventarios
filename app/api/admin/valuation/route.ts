import {denySharedWrite} from '../../../../lib/share-token';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {workspaceFor} from '../../../../lib/workspace';
import {inventoryFor} from '../../../../lib/inventory-store';
import {inventoryValuation,editCost} from '../../../../lib/valuation';
import type {CostOverride} from '../../../../lib/valuation-types';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};
async function costBook(ownerId:string){
 await env.DB!.prepare('INSERT OR IGNORE INTO inventory_costs(owner_id,revision,data) VALUES(?,0,?)').bind(ownerId,JSON.stringify({overrides:[]})).run();
 const row=await env.DB!.prepare('SELECT revision,data FROM inventory_costs WHERE owner_id=?').bind(ownerId).first<{revision:number;data:string}>();if(!row)throw Error('No se pudieron cargar los costos.');
 return {revision:row.revision,overrides:JSON.parse(row.data).overrides as CostOverride[]};
}
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión.'},{status:401,headers});
 try{const scope=await workspaceFor(user);if(scope.role!=='admin')return Response.json({error:'Solo el usuario maestro puede consultar los costos.'},{status:403,headers});
 const inventory=await inventoryFor(scope.ownerId),book=await costBook(scope.ownerId);return Response.json(inventoryValuation(inventory.state,book.overrides,book.revision,inventory.revision),{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudieron cargar los costos.'},{status:500,headers})}
}
export async function POST(request:Request){
 const sharedDenied=denySharedWrite(request);if(sharedDenied)return sharedDenied;
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión.'},{status:401,headers});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origen inválido.'},{status:403,headers});
 try{const scope=await workspaceFor(user);if(scope.role!=='admin')return Response.json({error:'Solo el usuario maestro puede modificar costos.'},{status:403,headers});
 const a=await request.json() as any,inventory=await inventoryFor(scope.ownerId),book=await costBook(scope.ownerId);
 if(a.revision!==undefined&&a.revision!==book.revision)return Response.json({error:'Los costos cambiaron en otro dispositivo. Actualiza y vuelve a revisar.'},{status:409,headers});
 let overrides = book.overrides;
 const at = new Date().toISOString();
 if (a.type === 'batch' && Array.isArray(a.items)) {
  for (const item of a.items) {
   overrides = editCost(overrides, inventory.state, item, at);
  }
 } else {
  overrides = editCost(overrides, inventory.state, a, at);
 }
 const updated=await env.DB!.prepare('UPDATE inventory_costs SET data=?,revision=revision+1 WHERE owner_id=? AND revision=? RETURNING revision').bind(JSON.stringify({overrides}),scope.ownerId,book.revision).first<{revision:number}>();
 if(!updated)return Response.json({error:'Otro dispositivo guardó un costo. Actualiza y vuelve a revisar.'},{status:409,headers});
 return Response.json(inventoryValuation(inventory.state,overrides,updated.revision,inventory.revision),{headers});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo guardar el costo.'},{status:400,headers})}
}
