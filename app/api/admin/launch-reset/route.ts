import {denySharedWrite} from '../../../../lib/share-token';
import {env} from 'cloudflare:workers';
import {resetWorkspaceForLaunch} from '../../../../lib/launch-reset';
export const dynamic='force-dynamic';

export async function POST(request:Request){
 const sharedDenied=denySharedWrite(request);if(sharedDenied)return sharedDenied;
 const secret=env.CLEAN_LAUNCH_RESET_TOKEN,supplied=request.headers.get('Authorization');
 const expected=secret?'Bearer '+secret:'';
 if(!secret||secret.length<32||!supplied||supplied.length!==expected.length)return Response.json({error:'Acceso no autorizado.'},{status:403});
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^supplied.charCodeAt(i);
 if(difference)return Response.json({error:'Acceso no autorizado.'},{status:403});
 try{return Response.json(await resetWorkspaceForLaunch(),{headers:{'Cache-Control':'no-store'}})}
 catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo iniciar el inventario.'},{status:409,headers:{'Cache-Control':'no-store'}})}
}
