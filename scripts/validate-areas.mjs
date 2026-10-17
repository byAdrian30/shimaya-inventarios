import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {areaSource} from '../lib/areas-source.ts';
import {emptyState,withCatalog,applyAction} from '../lib/inventory.ts';
import {requestUnit} from '../lib/requests.ts';

const file=process.argv[2];
if(!file)throw Error('Indica la ruta del Excel de áreas.');
const workbook=new ExcelJS.Workbook();
await workbook.xlsx.readFile(file);
const labels={BARRA:'Barra',SALON:'Salón',MAKIS:'Makis',RAMEN:'Ramen',FRITURA:'Fritura',SALTEADO:'Salteado'};
const groups={ABARROTES:'Abarrotes',SALSAS:'Salsas',PROTEINAS:'Proteinas',VERDURAS:'Verduras'};
const rows=[];
for(const sheetName of ['BARRA','SALON ','ABARROTES','SALSAS','PROTEINAS','VERDURAS']){
 const sheet=workbook.getWorksheet(sheetName);assert.ok(sheet,'Hoja ausente: '+sheetName);
 let area=labels[sheetName.trim()]||'';
 const simple=sheetName==='BARRA'||sheetName==='SALON ';
 sheet.eachRow((row,n)=>{
  const cell=row.getCell(simple?2:1),name=cell.text.trim();
  const heading=name.match(/^(ABARROTES|SALSAS|PROTEINAS|VERDURAS)\s+(MAKIS|RAMEN|FRITURA|SALTEADO)\s*$/i);
  if(heading){area=labels[heading[2].toUpperCase()];return}
  if(!name||cell.isMerged||/^PRODUCTOS?$/i.test(name))return;
  assert.ok(area,'Fila sin área: '+sheetName+':'+n);
  rows.push({id:'area-'+sheetName.trim().toLowerCase()+'-'+n,area,group:groups[sheetName]||area,name,referenceUnit:simple?'':row.getCell(2).text.trim(),source:sheetName.trim()+':'+n});
 });
}
assert.deepEqual(areaSource,rows,'El archivo original y las filas incorporadas deben coincidir exactamente.');
let state=withCatalog(emptyState());
const active=state.areaItems.filter(i=>i.active!==false);
assert.deepEqual(active.map(i=>({id:i.id,area:i.area,group:i.group,name:i.name,source:i.source})),rows.map(({referenceUnit,...row})=>row));
const counts=Object.fromEntries(['Barra','Salón','Makis','Salteado','Fritura','Ramen'].map(area=>[area,rows.filter(r=>r.area===area).length]));
assert.deepEqual(counts,{Barra:46,Salón:29,Makis:60,Salteado:44,Fritura:33,Ramen:25});
// Prueba local de las 237 filas: las cantidades no dependen del stock inicial.
for(const area of Object.keys(counts)){
 const items=active.filter(i=>i.area===area);
 const lines=items.map(item=>{const ingredientId=item.ingredientId||item.ingredientOptions?.[0];return {itemId:item.id,ingredientId,quantity:1,unit:requestUnit(state,item,ingredientId)}});
 state=applyAction(state,{type:'solicitar',date:'2026-10-11',area,requester:'Validación local',lines});
 assert.deepEqual(state.requests[0].lines.map(l=>l.name),items.map(i=>i.name));
 state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Validación local',lines:lines.map(l=>({itemId:l.itemId,quantity:1}))});
 assert.ok(state.requests[0].closed);
 assert.ok(state.requests[0].lines.every(l=>l.delivered===1));
}
console.log(JSON.stringify({total:rows.length,areas:counts,missing:0,extra:0,nameDifferences:0,rowsOrderedAndDispatched:state.requests.reduce((n,r)=>n+r.lines.length,0)},null,2));
