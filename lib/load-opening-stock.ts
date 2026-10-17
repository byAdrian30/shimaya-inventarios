import {env} from 'cloudflare:workers';
import {applyOpeningStock,openingStockSummary} from './opening-stock.ts';
import {openingStockVersion} from './opening-stock-source.ts';
import type {State} from './inventory.ts';
export async function loadOpeningStock(){
 const db=env.DB;if(!db)throw Error('No se encontró el inventario.');
 const settings=await db.prepare('SELECT data FROM inventory_state WHERE id=?').bind('shimaya-workspace-owner-v1').first<{data:string}>();
 const ownerId=settings?JSON.parse(settings.data).ownerId:null;if(typeof ownerId!=='string'||!ownerId)throw Error('No se encontró el administrador.');
 const backupId=ownerId+':'+openingStockVersion;
 for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare('SELECT data,revision FROM inventory_state WHERE id=?').bind(ownerId).first<{data:string;revision:number}>();if(!row)throw Error('No se encontró el stock.');
  const current:State=JSON.parse(row.data);if(current.stockLoadVersion===openingStockVersion)return {alreadyApplied:true,revision:row.revision,...openingStockSummary(current)};
  if(await db.prepare('SELECT id FROM inventory_reset_backups WHERE id=?').bind(backupId).first())throw Error('La carga ya tiene una copia guardada. Actualiza los datos.');
  const at=new Date().toISOString(),state=applyOpeningStock(current,at);
  await db.batch([
   db.prepare('INSERT OR IGNORE INTO inventory_reset_backups(id,owner_id,reset_version,revision,data,created_at) SELECT ?,id,?,revision,data,? FROM inventory_state WHERE id=? AND revision=?').bind(backupId,openingStockVersion,at,ownerId,row.revision),
   db.prepare('UPDATE inventory_state SET data=?,revision=revision+1 WHERE id=? AND revision=? AND EXISTS(SELECT 1 FROM inventory_reset_backups WHERE id=? AND revision=?)').bind(JSON.stringify(state),ownerId,row.revision,backupId,row.revision)
  ]);
  const saved=await db.prepare('SELECT data,revision FROM inventory_state WHERE id=?').bind(ownerId).first<{data:string;revision:number}>();
  if(saved){const result:State=JSON.parse(saved.data);if(result.stockLoadVersion===openingStockVersion)return {alreadyApplied:false,revision:saved.revision,...openingStockSummary(result)}}
 }
 throw Error('Otro dispositivo guardó datos. Reintenta la carga.');
}
