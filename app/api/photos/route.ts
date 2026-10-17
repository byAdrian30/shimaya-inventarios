import {denySharedWrite} from '../../../lib/share-token';
import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import {workspaceFor} from '../../../lib/workspace';
export async function POST(req:Request){
 const sharedDenied=denySharedWrite(req);if(sharedDenied)return sharedDenied;
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Inicia sesión.'},{status:401});
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origen inválido.'},{status:403});
 try{if((await workspaceFor(u)).role!=='admin')return Response.json({error:'Solo administración puede guardar comprobantes.'},{status:403});if(Number(req.headers.get('content-length'))>12e6)throw Error('Máximo 10 MB por foto.');const form=await req.formData();const file=form.get('file');if(!(file instanceof File)||file.size>10e6||!file.size||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Sube JPG, PNG o WEBP de hasta 10 MB.');const bytes=await file.arrayBuffer();const b=new Uint8Array(bytes);const valid=(b[0]===255&&b[1]===216&&b[2]===255)||(b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71)||(String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP');if(!valid)throw Error('El archivo no es una imagen válida.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');await env.BUCKET!.put(u.userId+'/'+hash,bytes,{httpMetadata:{contentType:file.type}});return Response.json({hash});}catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo subir la foto.'},{status:400})}
}
