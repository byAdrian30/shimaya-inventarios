import {denySharedWrite} from '../../../../lib/share-token';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {workspaceFor} from '../../../../lib/workspace';
export async function POST(request:Request){
 const sharedDenied=denySharedWrite(request);if(sharedDenied)return sharedDenied;
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión.'},{status:401});
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origen inválido.'},{status:403});
 try{
  const scope=await workspaceFor(user);if(scope.role!=='admin')return Response.json({error:'Solo administración puede ingresar mercadería.'},{status:403});
  if(Number(request.headers.get('Content-Length'))>12e6)throw Error('El PDF debe pesar hasta 10 MB.');
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||!file.size||file.size>10e6||!file.name.toLowerCase().endsWith('.pdf'))throw Error('Selecciona un PDF de hasta 10 MB.');
  const bytes=await file.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('El archivo no es un PDF válido.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  await env.BUCKET!.put(scope.ownerId+'/receipts/'+hash+'.pdf',bytes,{httpMetadata:{contentType:'application/pdf'}});
  return Response.json({hash,name:file.name.slice(0,180)});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo guardar el PDF.'},{status:400})}
}
