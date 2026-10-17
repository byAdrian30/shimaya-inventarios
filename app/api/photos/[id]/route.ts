import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../../chatgpt-auth';
import {workspaceFor} from '../../../../lib/workspace';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  const u=await getChatGPTUser();if(!u)return new Response('Inicia sesión',{status:401});
  const scope = await workspaceFor(u);
  if(scope.role!=='admin')return new Response('Solo administración puede consultar comprobantes.',{status:403});
  const resolved = typeof (params as any)?.then === 'function' ? await params : params;
  const id = resolved?.id;
  if(!id || !/^[a-f0-9]{64}$/.test(id))return new Response('No encontrada',{status:404});
  try {
    const photo=await env.BUCKET?.get(u.userId+'/'+id);
    if(photo) return new Response(photo.body,{headers:{'Content-Type':photo.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
  } catch {}
  const candidates = [
    resolve('C:/INVENTARIOS ALMACEN/datos/almacen_archivos', id),
    resolve(process.cwd(), '../datos/almacen_archivos', id),
    resolve(process.cwd(), 'datos/almacen_archivos', id),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const bytes = readFileSync(candidate);
      try { if (env.BUCKET) await env.BUCKET.put(u.userId+'/'+id, bytes, {httpMetadata:{contentType:'image/jpeg'}}); } catch {}
      return new Response(bytes, {headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
    }
  }
  return new Response('No encontrada',{status:404});
}
