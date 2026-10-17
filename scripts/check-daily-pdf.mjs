import fs from 'node:fs';
import {buildDailyPdf} from '../lib/daily-pdf.ts';
import {applyOpeningStock} from '../lib/opening-stock.ts';
import {emptyState,applyAction} from '../lib/inventory.ts';
const output=process.argv[2]||'/tmp/shimaya-pdf-check';fs.mkdirSync(output,{recursive:true});
let state=applyOpeningStock(emptyState(),'2026-10-11T20:00:00Z');
fs.writeFileSync(output+'/daily-empty.pdf',buildDailyPdf(state,'2026-10-11'));
for(const area of ['Barra','Salón','Makis','Ramen','Fritura','Salteado']){
 const items=state.areaItems.filter(i=>i.area===area&&i.active!==false);
 const lines=items.map(item=>{const ingredientId=item.ingredientOptions?.[0]||item.ingredientId,i=state.ingredients.find(i=>i.id===ingredientId);return {itemId:item.id,ingredientId,quantity:1.5,unit:i.unit}});
 state=applyAction(state,{type:'solicitar',operationId:'qa-order-'+area,date:'2026-10-11',area,requester:'Equipo de '+area,lines,note:'Prueba del PDF: todos los insumos del área.'});
 state=applyAction(state,{type:'despachar',operationId:'qa-dispatch-'+area,date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Almacén',lines:lines.map(line=>({itemId:line.itemId,quantity:0.5}))});
}
fs.writeFileSync(output+'/daily-full.pdf',buildDailyPdf(state,'2026-10-11'));
console.log(JSON.stringify({output,orderedRows:state.requests.reduce((n,r)=>n+r.lines.length,0),dispatchRows:state.requests.reduce((n,r)=>n+r.dispatches[0].quantities.length,0)}));
