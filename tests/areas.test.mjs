import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {areaSource,areasVersion} from '../lib/areas-source.ts';
import {catalogVersion} from '../lib/catalog-source.ts';
import {emptyState,withCatalog,applyAction} from '../lib/inventory.ts';
import {requestUnit,dispatchIngredientId} from '../lib/requests.ts';

const act=(s,a)=>applyAction(s,{date:'2026-10-11',...a});
test('Las 237 filas mantienen la huella del Excel original y sus seis conteos, incluido Barra 46',()=>{
 // Huella obtenida de las filas del workbook, incluidas tildes, unidades y repeticiones.
 assert.equal(createHash('sha256').update(JSON.stringify(areaSource)).digest('hex'),'a7ab2e5c610de6dd88f7d5b2bb22baf75886a49d0cacf3a6efc9110128866aa4');
 const s=withCatalog(emptyState()),active=s.areaItems.filter(i=>i.active!==false);
 assert.deepEqual(Object.fromEntries(['Barra','Salón','Makis','Salteado','Fritura','Ramen'].map(area=>[area,active.filter(i=>i.area===area).length])),{Barra:46,Salón:29,Makis:60,Salteado:44,Fritura:33,Ramen:25});
 assert.equal(new Set(active.map(i=>i.id)).size,237);
 assert.deepEqual(active.filter(i=>i.area==='Barra').map(i=>i.name),areaSource.filter(i=>i.area==='Barra').map(i=>i.name));
});
test('Las dos pulpas de mango de Barra se piden por fila y acumulan solo el stock compartido',()=>{
 let s=withCatalog(emptyState());const items=s.areaItems.filter(i=>i.area==='Barra'&&i.name==='PULPA DE MANGO');
 assert.deepEqual(items.map(i=>i.source),['BARRA:22','BARRA:24']);assert.equal(items[0].ingredientId,items[1].ingredientId);
 s=act(s,{type:'solicitar',area:'Barra',requester:'Barra',lines:items.map((i,n)=>({itemId:i.id,quantity:n+2,unit:requestUnit(s,i)}))});
 assert.equal(s.requests[0].lines.length,2);
 s=act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Equipo',lines:s.requests[0].lines.map(l=>({itemId:l.itemId,quantity:l.quantity}))});
 assert.equal(s.ingredients.find(i=>i.id===items[0].ingredientId).stock,-5);assert.equal(s.movements[0].lines.length,1);assert.equal(s.movements[0].lines[0].delta,-5);
 s=act(s,{type:'revertir',id:s.movements[0].id});assert.equal(s.ingredients.find(i=>i.id===items[0].ingredientId).stock,0);assert.ok(s.requests[0].lines.every(l=>l.delivered===0));
});
test('SOJU conserva una fila original y exige elegir una presentación válida del inventario',()=>{
 const s=withCatalog(emptyState()),item=s.areaItems.find(i=>i.name==='SOJU');assert.equal(s.areaItems.filter(i=>i.name==='SOJU').length,1);assert.equal(item.ingredientOptions.length,6);
 const action={type:'solicitar',area:'Barra',requester:'Barra',lines:[{itemId:item.id,quantity:2,unit:'caja'}]};
 assert.throws(()=>act(s,action),/Selecciona la presentación/);
 assert.throws(()=>act(s,{...action,lines:[{...action.lines[0],ingredientId:'catalog-012'}]}),/Selecciona la presentación/);
 for(const ingredientId of item.ingredientOptions){
  let n=act(s,{...action,lines:[{...action.lines[0],ingredientId}]});
  assert.equal(n.requests[0].lines[0].name,'SOJU');assert.equal(n.requests[0].lines[0].presentationSelected,true);assert.equal(dispatchIngredientId(n,n.requests[0].lines[0]),ingredientId);
  n=act(n,{type:'despachar',requestId:n.requests[0].id,dispatcher:'Equipo',lines:[{itemId:item.id,quantity:2}]});
  assert.equal(n.ingredients.find(i=>i.id===ingredientId).stock,-2);
  assert.ok(n.ingredients.filter(i=>i.id!==ingredientId).every(i=>i.stock===0));
 }
});
test('Un cambio de vínculo no sustituye la presentación elegida de un pedido enviado',()=>{
 let s=withCatalog(emptyState());const item=s.areaItems.find(i=>i.name==='SOJU'),chosen=item.ingredientOptions[2],replacement=item.ingredientOptions[0];
 s=act(s,{type:'solicitar',area:'Barra',requester:'Barra',lines:[{itemId:item.id,ingredientId:chosen,quantity:3,unit:'caja'}]});
 s=act(s,{type:'vincular-area',itemId:item.id,ingredientId:replacement});
 assert.equal(s.areaItems.find(i=>i.id===item.id).name,'SOJU');
 s=act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Equipo',lines:[{itemId:item.id,quantity:3}]});
 assert.equal(s.ingredients.find(i=>i.id===chosen).stock,-3);assert.equal(s.ingredients.find(i=>i.id===replacement).stock,0);
});
test('La migración de áreas preserva saldos, mínimos, historial y despachos parciales históricos',()=>{
 let s=withCatalog(emptyState());const ingredient=s.ingredients.find(i=>i.id==='catalog-273');ingredient.stock=-7;ingredient.minimum=4;ingredient.configured=true;
 const historical={id:'area-barra-43-variant-catalog-273',area:'Barra',group:'Barra',name:ingredient.name,source:'BARRA:43',referenceUnit:'Caja',ingredientId:ingredient.id,active:true};
 s.areaItems=s.areaItems.filter(i=>i.id!=='area-barra-24'&&i.id!=='area-barra-43');s.areaItems.push(historical);delete s.areasVersion;assert.equal(s.catalogVersion,catalogVersion);
 s.requests=[{id:'old-order',number:'PED-00001',date:'2026-10-10',at:'2026-10-10T10:00:00Z',area:'Barra',requester:'Equipo',actorId:'staff',note:'',lines:[{itemId:historical.id,name:historical.name,ingredientId:ingredient.id,quantity:3,unit:'caja',delivered:1}],dispatches:[],closed:false}];
 s.movements=[{id:'old-note',date:'2026-10-10',at:'2026-10-10T10:00:00Z',kind:'solicitud',note:'Anterior',reference:'PED-00001',photos:[],lines:[]}];
 const old=structuredClone(s),n=withCatalog(s);assert.equal(n.areasVersion,areasVersion);assert.deepEqual(n.ingredients,old.ingredients);assert.deepEqual(n.requests,old.requests);assert.deepEqual(n.movements,old.movements);assert.equal(n.areaItems.find(i=>i.id===historical.id).active,false);assert.equal(n.areaItems.filter(i=>i.active!==false&&i.area==='Barra').length,46);assert.deepEqual(withCatalog(n),n);
 const delivered=act(n,{type:'despachar',requestId:'old-order',dispatcher:'Equipo',lines:[{itemId:historical.id,quantity:2}]});assert.equal(delivered.ingredients.find(i=>i.id===ingredient.id).stock,-9);assert.equal(delivered.requests[0].closed,true);
});
test('La unidad configurada de un producto ausente prevalece sobre el valor inicial de la fila',()=>{
 let s=withCatalog(emptyState());const item=s.areaItems.find(i=>i.name==='COULIS DE FRAMBUESA'),ingredient=s.ingredients.find(i=>i.id===item.ingredientId);assert.ok(ingredient.unitNote);
 s=act(s,{type:'ingredient',id:ingredient.id,name:ingredient.name,unit:'kg',stock:0,minimum:0});assert.equal(requestUnit(s,s.areaItems.find(i=>i.id===item.id)),'kg');assert.equal(s.ingredients.find(i=>i.id===ingredient.id).unitNote,'');
 s=act(s,{type:'solicitar',area:'Barra',requester:'Barra',lines:[{itemId:item.id,quantity:1.5,unit:'kg'}]});s=act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Equipo',lines:[{itemId:item.id,quantity:1.5}]});assert.equal(s.ingredients.find(i=>i.id===ingredient.id).stock,-1.5);
});
test('Revisar vínculos conserva nombres y filas originales durante nuevas migraciones',()=>{
 let s=withCatalog(emptyState());const item=s.areaItems.find(i=>i.id==='area-barra-7');s=act(s,{type:'vincular-area',itemId:item.id,ingredientId:'catalog-030'});delete s.areasVersion;const n=withCatalog(s);assert.equal(n.areaItems.find(i=>i.id===item.id).name,'JARABE DE GOMA');assert.equal(n.areaItems.find(i=>i.id===item.id).ingredientId,'catalog-030');assert.equal(n.areaItems.filter(i=>i.active!==false).length,237);
});
