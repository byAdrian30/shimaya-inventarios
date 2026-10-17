import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../../chatgpt-auth';
import {workspaceFor} from '../../../../../lib/workspace';
export async function GET(request:Request,{params}:{params:Promise<{hash:string}>}){
 const user=await getChatGPTUser();if(!user)return new Response('Inicia sesión.',{status:401});
 const scope=await workspaceFor(user);if(scope.role!=='admin')return new Response('Solo administración puede revisar documentos.',{status:403});
 const {hash}=await params;if(!/^[a-f0-9]{64}$/.test(hash))return new Response('Documento no encontrado.',{status:404});
 const document=await env.BUCKET!.get(scope.ownerId+'/receipts/'+hash+'.pdf');if(!document)return new Response('Documento no encontrado.',{status:404});
 return new Response(document.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="ingreso-mercaderia.pdf"','X-Content-Type-Options':'nosniff','Cache-Control':'private, max-age=3600'}});
}
