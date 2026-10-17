import {denySharedWrite} from '../../../../lib/share-token';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {workspaceFor} from '../../../../lib/workspace';
import {inventoryFor} from '../../../../lib/inventory-store';
import {openingStockSummary} from '../../../../lib/opening-stock';
import {loadOpeningStock} from '../../../../lib/load-opening-stock';
export const dynamic='force-dynamic';
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión.'},{status:401});
 const scope=await workspaceFor(user);if(scope.role!=='admin')return Response.json({error:'Solo administración puede revisar esta carga.'},{status:403});
 const data=await inventoryFor(scope.ownerId);return Response.json(data.state.stockLoadVersion?openingStockSummary(data.state):{loaded:false},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const sharedDenied=denySharedWrite(request);if(sharedDenied)return sharedDenied;
 const token=env.OPENING_STOCK_TOKEN,expected=token?'Bearer '+token:'',supplied=request.headers.get('Authorization');
 if(!token||token.length<32||!supplied||supplied.length!==expected.length)return Response.json({error:'Acceso no autorizado.'},{status:403});
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^supplied.charCodeAt(i);if(difference)return Response.json({error:'Acceso no autorizado.'},{status:403});
 try{return Response.json(await loadOpeningStock(),{headers:{'Cache-Control':'no-store'}})}catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo cargar.'},{status:409})}
}
