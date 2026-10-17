import {env} from 'cloudflare:workers';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
function authorized(request:Request){
 const token=env.FULL_SITE_EXPORT_TOKEN,provided=request.headers.get('Authorization')||'';
 if(!token||!/^[A-Za-z0-9_-]{43,128}$/.test(token))return false;
 const expected='Bearer '+token;if(provided.length!==expected.length)return false;
 let difference=0;for(let i=0;i<expected.length;i++)difference|=expected.charCodeAt(i)^provided.charCodeAt(i);return difference===0;
}
export async function GET(request:Request){
 if(!authorized(request))return Response.json({error:'Exportación privada desactivada o no autorizada.'},{status:403,headers});
 try{
  const db=env.DB!;
  const settings=await db.prepare('SELECT data FROM inventory_state WHERE id=?').bind('shimaya-workspace-owner-v1').first<{data:string}>();
  const ownerId=settings?JSON.parse(settings.data).ownerId:null;
  if(typeof ownerId!=='string'||!ownerId)throw Error('Espacio no disponible.');
  const file=new URL(request.url).searchParams.get('file');
  if(file!==null){
   if(!file.startsWith(ownerId+'/')||file.split('/').includes('..'))return Response.json({error:'Archivo no encontrado.'},{status:404,headers});
   const object=await env.BUCKET!.get(file);
   if(!object)return Response.json({error:'Archivo no encontrado.'},{status:404,headers});
   return new Response(object.body,{headers:{...headers,'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Content-Disposition':'attachment'}});
  }
  // D1 ejecuta estas cuatro lecturas como una transacción consistente, sin modificar datos.
  const names=['inventory_state','inventory_costs','team_members','inventory_reset_backups'];
  const result=await db.batch([
   db.prepare('SELECT id,revision,data FROM inventory_state WHERE id IN (?,?) ORDER BY id').bind('shimaya-workspace-owner-v1',ownerId),
   db.prepare('SELECT owner_id,revision,data FROM inventory_costs WHERE owner_id=?').bind(ownerId),
   db.prepare('SELECT email,user_id,name,area,status,created_at,updated_at,role FROM team_members ORDER BY email'),
   db.prepare('SELECT id,owner_id,reset_version,revision,data,created_at FROM inventory_reset_backups WHERE owner_id=? ORDER BY id').bind(ownerId),
  ]);
  const objects:{key:string;size:number;etag:string;uploaded:string}[]=[];let cursor:string|undefined;
  do{
   const page=await env.BUCKET!.list({prefix:ownerId+'/',limit:1000,...(cursor?{cursor}:{})});
   for(const object of page.objects)objects.push({key:object.key,size:object.size,etag:object.etag,uploaded:object.uploaded.toISOString()});
   cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return Response.json({format:'shimaya-full-backup-v1',exportedAt:new Date().toISOString(),ownerId,tables:Object.fromEntries(names.map((name,index)=>[name,result[index].results])),objects},{headers});
 }catch{return Response.json({error:'No se pudo preparar la exportación completa.'},{status:500,headers})}
}
function readOnly(){return Response.json({error:'La exportación es de solo lectura.'},{status:405,headers:{...headers,Allow:'GET, HEAD'}})}
export const POST=readOnly;
export const PUT=readOnly;
export const PATCH=readOnly;
export const DELETE=readOnly;
