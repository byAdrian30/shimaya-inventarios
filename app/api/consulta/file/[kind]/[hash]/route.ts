import {env} from 'cloudflare:workers';
import {sharedOwner,sharedInventory,sharedHeaders,sharedFailure,SharedAccessError,rejectSharedMutation} from '../../../../../../lib/shared-access';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{kind:string;hash:string}>}){
 try{
  const ownerId=await sharedOwner(request),{kind,hash}=await params;
  if(!/^[a-f0-9]{64}$/.test(hash)||!['pdf','photo'].includes(kind))throw new SharedAccessError('Comprobante no encontrado.',404);
  const {state}=await sharedInventory(ownerId);
  const referenced=state.movements.some(m=>kind==='pdf'?m.document?.hash===hash:m.photos?.includes(hash)||m.photoColumns?.some(p=>p.hash===hash));
  if(!referenced)throw new SharedAccessError('Comprobante no encontrado.',404);
  let file: any = null;
  try {
    file = await env.BUCKET?.get(kind==='pdf'?ownerId+'/receipts/'+hash+'.pdf':ownerId+'/'+hash);
  } catch {}
  if(!file) {
    const { existsSync, readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const localName = kind === 'pdf' ? hash + '.pdf' : hash;
    const localPath = resolve(process.cwd(), '../datos/almacen_archivos', localName);
    if (existsSync(localPath)) {
      const bytes = readFileSync(localPath);
      return new Response(bytes, {headers:{...sharedHeaders,'Content-Type':kind==='pdf'?'application/pdf':'image/jpeg','Content-Disposition':'attachment; filename="comprobante.'+(kind==='pdf'?'pdf':'jpg')+'"'}});
    }
    throw new SharedAccessError('Comprobante no encontrado.',404);
  }
  return new Response(file.body,{headers:{...sharedHeaders,'Content-Type':kind==='pdf'?'application/pdf':file.httpMetadata?.contentType||'image/jpeg','Content-Disposition':'attachment; filename="comprobante.'+(kind==='pdf'?'pdf':'jpg')+'"'}});
 }catch(error){return sharedFailure(error)}
}
export const POST=rejectSharedMutation;
export const PUT=rejectSharedMutation;
export const PATCH=rejectSharedMutation;
export const DELETE=rejectSharedMutation;
