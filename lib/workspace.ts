import {env} from 'cloudflare:workers';
import type {ChatGPTUser} from '../app/chatgpt-auth';
import {cleanEmail,memberRole,type TeamMember} from './team-access.ts';
const ownerEmail='adrianbarranzuela0108@gmail.com';
export async function workspaceFor(user:ChatGPTUser){
 const key='shimaya-workspace-owner-v1',email=cleanEmail(user.email);
 // La primera cuenta que entra a un enlace público nunca se convierte en administradora.
 if(email===ownerEmail)await env.DB!.prepare('INSERT OR IGNORE INTO inventory_state(id,revision,data) VALUES(?,0,?)').bind(key,JSON.stringify({ownerId:user.userId})).run();
 const row=await env.DB!.prepare('SELECT data FROM inventory_state WHERE id=?').bind(key).first<{data:string}>();
 if(!row)throw Error('Administración debe abrir el sitio para activar el espacio de Shimaya.');
 const settings=JSON.parse(row.data),{ownerId}=settings;if(typeof ownerId!=='string'||!ownerId)throw Error('Espacio inválido.');
 // Actualización de permisos solicitada: conserva cuentas, áreas y suspensiones.
 if(settings.teamAccessVersion!=='pedido-despacho-v1')await env.DB!.batch([
  env.DB!.prepare('UPDATE team_members SET role=? WHERE role IN (?,?)').bind('operator','staff','dispatch'),
  env.DB!.prepare('UPDATE inventory_state SET data=? WHERE id=? AND data=?').bind(JSON.stringify({...settings,teamAccessVersion:'pedido-despacho-v1'}),key,row.data)
 ]);
 const member=await env.DB!.prepare('SELECT email,user_id AS userId,name,area,role,status,created_at AS createdAt,updated_at AS updatedAt FROM team_members WHERE email=?').bind(email).first<TeamMember>();
 const role=email===ownerEmail?memberRole(user.userId,ownerId,member):memberRole(user.userId,'',member);
 if((role==='staff'||role==='dispatch'||role==='operator')&&!member?.userId){
  try{
   await env.DB!.prepare('UPDATE team_members SET user_id=?,name=?,updated_at=? WHERE email=? AND (user_id IS NULL OR user_id=\'\') AND status=?').bind(user.userId,user.fullName||user.displayName,new Date().toISOString(),email,'active').run();
  }catch(err){
   console.error('[workspaceFor] Error al vincular user_id:', err);
  }
 }
 return {ownerId,role,email,area:member?.area||'',status:role==='admin'?'active':member?.status||'unregistered',displayName:user.fullName||user.displayName};
}
