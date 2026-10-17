import {denySharedWrite} from '../../../lib/share-token';
import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {workspaceFor} from '../../../lib/workspace';
import {cleanEmail,cleanArea,cleanRole} from '../../../lib/team-access';
export const dynamic='force-dynamic';
export async function GET(){
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Inicia sesión.'},{status:401});
 try{const scope=await workspaceFor(u);if(scope.role!=='admin')return Response.json({role:scope.role,status:scope.status,email:scope.email,area:scope.area});
  const list=await env.DB!.prepare('SELECT email,user_id AS userId,name,area,role,status,created_at AS createdAt,updated_at AS updatedAt FROM team_members ORDER BY CASE status WHEN ? THEN 0 WHEN ? THEN 1 ELSE 2 END,created_at DESC').bind('pending','active').all();return Response.json({members:list.results,ownerEmail:scope.email},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'No se pudo cargar el equipo.'},{status:500})}
}
export async function POST(req:Request){
 const sharedDenied=denySharedWrite(req);if(sharedDenied)return sharedDenied;
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Inicia sesión.'},{status:401});
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Origen inválido.'},{status:403});
 try{
  const a=await req.json() as any,scope=await workspaceFor(u),now=new Date().toISOString();
  if(a.type==='request-access'){
   if(scope.role!=='guest')return Response.json({ok:true});if(scope.status==='suspended')throw Error('Tu acceso está suspendido. Comunícate con administración.');
   const area=cleanArea(a.area);if(!area)throw Error('Selecciona tu área.');
   await env.DB!.prepare('INSERT OR IGNORE INTO team_members(email,user_id,name,area,role,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(scope.email,u.userId,scope.displayName,area,'operator','pending',now,now).run();return Response.json({ok:true,status:'pending'});
  }
  if(scope.role!=='admin')return Response.json({error:'Solo administración puede autorizar colaboradores.'},{status:403});
  const email=cleanEmail(a.email),area=cleanArea(a.area);if(email===scope.email)throw Error('La cuenta administradora conserva su acceso.');
  if(a.type==='invite'){
   await env.DB!.prepare('INSERT INTO team_members(email,user_id,name,area,role,status,created_at,updated_at) VALUES(?,NULL,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET area=excluded.area,role=excluded.role,status=excluded.status,updated_at=excluded.updated_at').bind(email,email,area,cleanRole(a.role),'active',now,now).run();
  }else if(a.type==='approve'||a.type==='suspend'){
   const changed=await env.DB!.prepare('UPDATE team_members SET status=?,area=?,role=COALESCE(?,role),updated_at=? WHERE email=? RETURNING email').bind(a.type==='approve'?'active':'suspended',area,a.role===undefined?null:cleanRole(a.role),now,email).first();if(!changed)throw Error('No se encontró al colaborador.');
  }else throw Error('Acción no válida.');
  return Response.json({ok:true});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo actualizar el equipo.'},{status:400})}
}
