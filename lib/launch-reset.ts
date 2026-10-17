import {env} from 'cloudflare:workers';
import {withCatalog,type State} from './inventory.ts';

// This launch is a fixed, single operation. Normal inventory reads never reset data.
export const launchResetVersion='launch-2026-10-11-v1';
export function cleanLaunchState(current:State,at:string):State{
 if(current.launchResetVersion===launchResetVersion)return structuredClone(current);
 const state=withCatalog(current);
 for(const ingredient of state.ingredients)ingredient.stock=0;
 state.requests=[];state.movements=[];
 state.launchResetVersion=launchResetVersion;state.launchResetAt=at;
 return state;
}
function summary(state:State,revision:number,alreadyApplied:boolean){
 return {resetVersion:launchResetVersion,resetAt:state.launchResetAt,revision,alreadyApplied,ingredients:state.ingredients.length,nonzeroStock:state.ingredients.filter(i=>i.stock!==0).length,requests:state.requests?.length||0,movements:state.movements.length,areaItems:state.areaItems?.filter(i=>i.active!==false).length||0};
}
export async function resetWorkspaceForLaunch(){
 const db=env.DB;if(!db)throw Error('No se encontró el inventario.');
 const settings=await db.prepare('SELECT data FROM inventory_state WHERE id=?').bind('shimaya-workspace-owner-v1').first<{data:string}>();
 const ownerId=settings?JSON.parse(settings.data).ownerId:null;
 if(typeof ownerId!=='string'||!ownerId)throw Error('No se encontró el espacio de administración.');
 const backupId=ownerId+':'+launchResetVersion;
 for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare('SELECT data,revision FROM inventory_state WHERE id=?').bind(ownerId).first<{data:string;revision:number}>();
  if(!row)throw Error('No se encontró el inventario del administrador.');
  const current:State=JSON.parse(row.data);
  if(current.launchResetVersion===launchResetVersion)return summary(current,row.revision,true);
  const previousBackup=await db.prepare('SELECT id FROM inventory_reset_backups WHERE id=?').bind(backupId).first();
  if(previousBackup)throw Error('El inicio limpio ya tiene una copia guardada. Actualiza antes de volver a intentar.');
  const at=new Date().toISOString(),state=cleanLaunchState(current,at);
  // D1 batch is atomic: preserve the complete original snapshot before replacing it.
  // The revision guard prevents clearing changes saved by another device meanwhile.
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO inventory_reset_backups(id,owner_id,reset_version,revision,data,created_at) SELECT ?,id,?,revision,data,? FROM inventory_state WHERE id=? AND revision=?').bind(backupId,launchResetVersion,at,ownerId,row.revision),
   db.prepare('UPDATE inventory_state SET data=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM inventory_reset_backups WHERE id=? AND revision=?)').bind(JSON.stringify(state),ownerId,row.revision,backupId,row.revision)
  ]);
  const saved=await db.prepare('SELECT data,revision FROM inventory_state WHERE id=?').bind(ownerId).first<{data:string;revision:number}>();
  if(saved){const final:State=JSON.parse(saved.data);if(final.launchResetVersion===launchResetVersion)return summary(final,saved.revision,false)}
 }
 throw Error('El inventario cambió durante el inicio limpio. Vuelve a intentar.');
}
