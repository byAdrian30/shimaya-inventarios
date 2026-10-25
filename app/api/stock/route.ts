import {getChatGPTUser} from '../../chatgpt-auth';
import {workspaceFor} from '../../../lib/workspace';
import {readOnlyInventoryFor} from '../../../lib/inventory-store';
import {canViewStock} from '../../../lib/team-access';
import {configured,isTrago} from '../../../lib/inventory';
import type {StockSnapshot} from '../../../lib/stock-types';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Cookie','X-Content-Type-Options':'nosniff'};
export async function GET(){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión para consultar el stock.'},{status:401,headers});
 try{
  const scope=await workspaceFor(user);
  if(!canViewStock(scope.role))return Response.json({error:'Tu perfil no tiene acceso a esta consulta de stock.'},{status:403,headers});
  const {state,revision}=await readOnlyInventoryFor(scope.ownerId);
  const data:StockSnapshot={revision,readOnly:true,items:state.ingredients.filter(i=>!isTrago(i.name,i.category)).map(i=>({id:i.id,name:i.name,category:i.category,unit:i.stockBasis==='piece'?'Pieza suelta':i.unit||i.sourceUnit||'Por definir',stock:i.stock,configured:configured(i),unitNote:i.unitNote||'',noOrder:!!i.noOrder}))};
  return Response.json(data,{headers});
 }catch{return Response.json({error:'No se pudo consultar el stock. Intenta actualizar los datos.'},{status:500,headers})}
}
function readOnly(){return Response.json({error:'Esta consulta es de solo lectura. No permite modificar stock.'},{status:405,headers:{...headers,Allow:'GET, HEAD'}})}
export const POST=readOnly;
export const PUT=readOnly;
export const PATCH=readOnly;
export const DELETE=readOnly;
