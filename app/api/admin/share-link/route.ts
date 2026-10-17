import {getChatGPTUser} from '../../../chatgpt-auth';
import {workspaceFor} from '../../../../lib/workspace';
import {configuredShareToken,sharedHeaders} from '../../../../lib/shared-access';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:'Inicia sesión.'},{status:401,headers:sharedHeaders});
 try{
  const scope=await workspaceFor(user);
  if(scope.role!=='admin')return Response.json({error:'Solo el usuario maestro puede obtener este enlace.'},{status:403,headers:sharedHeaders});
  const token=configuredShareToken();
  if(!token)return Response.json({error:'El enlace de consulta está desactivado.'},{status:503,headers:sharedHeaders});
  return Response.json({url:new URL('/consulta',request.url).href+'#token='+token,readOnly:true},{headers:{...sharedHeaders,Vary:'Cookie'}});
 }catch{return Response.json({error:'No se pudo obtener el enlace.'},{status:500,headers:sharedHeaders})}
}
