import {denySharedWrite} from '../../../lib/share-token';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { applyAction } from '../../../lib/inventory';
import {workspaceFor} from '../../../lib/workspace';
import {canPerform} from '../../../lib/requests';
import {inventoryFor,visibleInventory} from '../../../lib/inventory-store';
export const dynamic='force-dynamic';
export async function GET(){
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Inicia sesión para acceder.'},{status:401});
 try{const scope=await workspaceFor(u);if(scope.role==='guest')return Response.json({access:scope.status,role:scope.role,displayName:scope.displayName,email:scope.email},{status:403,headers:{'Cache-Control':'no-store'}});const data=await inventoryFor(scope.ownerId);return Response.json({revision:data.revision,state:visibleInventory(data.state,scope.role,u.userId,scope.area),role:scope.role,userId:u.userId,displayName:scope.displayName,area:scope.area},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({error:'No se pudo cargar el inventario. Vuelve a intentar.'},{status:500})}
}
export async function POST(req:Request){
 const sharedDenied=denySharedWrite(req);if(sharedDenied)return sharedDenied;
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Inicia sesión para guardar.'},{status:401});
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origen inválido.'},{status:403});
 try{const a=await req.json() as any;const scope=await workspaceFor(u);if(!canPerform(scope.role,a.type))return Response.json({error:'Tu perfil no tiene permiso para esta acción.'},{status:403});a.actorId=u.userId;if(scope.role!=='admin'&&a.type==='solicitar'){a.requester=scope.displayName;if(scope.area&&a.area!==scope.area)return Response.json({error:'Tu acceso está asignado al área '+scope.area+'.'},{status:403})}
 if(a.type==='eliminar-orden')a.deletedBy=scope.displayName;
 const row=await inventoryFor(scope.ownerId);
 if(scope.role!=='admin'&&a.type==='despachar'){a.dispatcher=scope.displayName;if(scope.area&&row.state.requests?.find(r=>r.id===a.requestId)?.area!==scope.area)return Response.json({error:'Solo puedes despachar pedidos del área '+scope.area+'.'},{status:403})}
 if(a.revision!==row.revision&&a.type!=='solicitar')return Response.json({error:'El inventario cambió en otro dispositivo. Recarga los datos y revisa las cantidades.'},{status:409});
 if(a.type==='pedido')throw Error('Las salidas por foto fueron reemplazadas por Pedido y Despacho. Confirma la entrega desde Despacho.');
 if(a.type==='recepcion'&&a.document){if(!/^[a-f0-9]{64}$/.test(a.document.hash))throw Error('Documento inválido.');if(!await env.BUCKET!.head(scope.ownerId+'/receipts/'+a.document.hash+'.pdf'))throw Error('Sube primero el PDF del ingreso.');}
 let state=applyAction(row.state,a);let data=JSON.stringify(state);if(new TextEncoder().encode(data).length>1800000)throw Error('El historial alcanzó el límite de almacenamiento. Exporta tus datos y solicita ampliar el sistema.');
 let result=await env.DB!.prepare('UPDATE inventory_state SET data=?,revision=revision+1 WHERE id=? AND revision=? RETURNING revision').bind(data,scope.ownerId,row.revision).first<{revision:number}>();
 if(!result&&a.type==='solicitar'){
  for(let retry=0;retry<3;retry++){
   const freshRow=await inventoryFor(scope.ownerId);
   state=applyAction(freshRow.state,a);
   data=JSON.stringify(state);
   result=await env.DB!.prepare('UPDATE inventory_state SET data=?,revision=revision+1 WHERE id=? AND revision=? RETURNING revision').bind(data,scope.ownerId,freshRow.revision).first<{revision:number}>();
   if(result)break;
  }
 }
 if(!result)return Response.json({error:'Otro dispositivo guardó cambios. Recarga y revisa nuevamente.'},{status:409});
 return Response.json({state:visibleInventory(state,scope.role,u.userId,scope.area),revision:result.revision});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo guardar.'},{status:400})}
}
