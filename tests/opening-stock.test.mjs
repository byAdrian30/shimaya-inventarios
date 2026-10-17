import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOpeningStock,openingStockSummary} from '../lib/opening-stock.ts';
import {openingStockSource,openingStockVersion} from '../lib/opening-stock-source.ts';
import {emptyState,configured,applyAction,withCatalog} from '../lib/inventory.ts';

test('Los 150 renglones configuran todos los insumos y dejan en cero lo que no está en la lista',()=>{
 const state=applyOpeningStock(emptyState(),'2026-10-11T20:00:00Z'),summary=openingStockSummary(state);
 assert.equal(openingStockSource.length,150);assert.equal(summary.ingredients,332);assert.equal(summary.withStock,149);assert.equal(summary.zeroStock,183);assert.equal(summary.unconfigured,0);assert.ok(state.ingredients.every(configured));assert.equal(state.areaItems.filter(i=>i.active!==false).length,240);
 const expected=new Map();for(const row of openingStockSource)expected.set(row.ingredientId,(expected.get(row.ingredientId)||0)+row.quantity);
 for(const ingredient of state.ingredients)assert.ok(Math.abs(ingredient.stock-(expected.get(ingredient.id)||0))<1e-6,ingredient.name);
 for(const id of ['catalog-092','catalog-068'])assert.equal(state.ingredients.find(i=>i.id===id).unit,'und');
 assert.equal(state.ingredients.find(i=>i.id==='catalog-092').stock,60);assert.equal(state.ingredients.find(i=>i.id==='catalog-092').stockBasis,'piece');assert.equal(state.ingredients.find(i=>i.id==='catalog-092').purchasePackSize,30);
 assert.equal(state.ingredients.find(i=>i.id==='catalog-068').stock,124);assert.match(state.ingredients.find(i=>i.id==='catalog-068').unitNote,/20 láminas/);
 for(const [id,stock] of [['catalog-020',2.480],['catalog-181',1.920],['catalog-182',4.855],['catalog-303',0.5]]){const i=state.ingredients.find(i=>i.id===id);assert.equal(i.stock,stock);assert.equal(i.unit,'kg');}
});
test('La carga reconoce los identificadores de inventarios anteriores y no duplica productos ya vinculados',()=>{
 const original=withCatalog(emptyState());for(const ingredient of original.ingredients){const oldId=ingredient.id;ingredient.id='previous-'+oldId;for(const item of original.areaItems)if(item.ingredientId===oldId)item.ingredientId=ingredient.id;}
 const state=applyOpeningStock(original,'2026-10-11T20:00:00Z');assert.equal(state.ingredients.length,332);assert.equal(state.ingredients.find(i=>i.catalogId==='catalog-092').stock,60);assert.equal(state.ingredients.find(i=>i.catalogId==='catalog-092').stockBasis,'piece');assert.equal(state.ingredients.find(i=>i.name==='COULIS DE FRAMBUESA').stock,11);
});
test('Se separan proteínas, salsas y presentaciones repetidas; Kaen se suma sin sobrescribir',()=>{
 const state=applyOpeningStock(emptyState(),'2026-10-11T20:00:00Z'),stock=id=>state.ingredients.find(i=>i.id===id).stock;
 for(const [id,value] of [['catalog-131',12],['catalog-240',8],['catalog-156',3],['catalog-246',9],['catalog-177',8],['catalog-242',5],['catalog-270',6],['catalog-258',15],['catalog-290',10],['catalog-266',24]])assert.equal(stock(id),value,id);
 assert.equal(stock('catalog-081'),25);assert.equal(stock('catalog-216'),0);assert.equal(stock('catalog-199'),3);
 assert.deepEqual(state.ingredients.filter(i=>i.id.startsWith('stock-')).map(i=>[i.name,i.stock]),[['GAS BUTANO',40],['KATSU AHUMADA',3],['BLEND DE MARGARITA',8]]);
 assert.match(state.ingredients.find(i=>i.id==='catalog-122').aliases,/Layu/);assert.match(state.ingredients.find(i=>i.id==='catalog-237').aliases,/Digion/);
});
test('La carga reemplaza saldos, conserva pedidos e historial y no se repite sobre operaciones reales',()=>{
 let state=applyOpeningStock(emptyState(),'2026-10-11T20:00:00Z');
 const ebi=state.areaItems.find(i=>i.ingredientId==='catalog-092'),requestAction={type:'solicitar',date:'2026-10-11',requester:'Equipo',area:ebi.area,lines:[{itemId:ebi.id,quantity:2,unit:'und'}]};
 state=applyAction(state,requestAction);state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Almacén',lines:[{itemId:ebi.id,quantity:2}]});
 assert.equal(state.ingredients.find(i=>i.id==='catalog-092').stock,58);
 const retry=applyOpeningStock(state,'2026-10-12T20:00:00Z');assert.deepEqual(retry,state);assert.equal(retry.stockLoadVersion,openingStockVersion);
 delete state.stockLoadVersion;const requests=structuredClone(state.requests),movements=structuredClone(state.movements);state.ingredients.find(i=>i.id==='catalog-006').stock=7;
 const reapplied=applyOpeningStock(state,'2026-10-12T20:00:00Z');assert.deepEqual(reapplied.requests,requests);assert.deepEqual(reapplied.movements.slice(1),movements);assert.equal(reapplied.ingredients.find(i=>i.id==='catalog-006').stock,0);
});
test('Cada área puede pedir y despachar todos sus insumos, incluso los de saldo cero, sin errores de configuración',()=>{
 for(const area of ['Barra','Salón','Makis','Ramen','Fritura','Salteado']){
  let state=applyOpeningStock(emptyState(),'2026-10-11T20:00:00Z');const items=state.areaItems.filter(i=>i.area===area&&i.active!==false);
  const lines=items.map(item=>{const ingredientId=item.ingredientOptions?.[0]||item.ingredientId,i=state.ingredients.find(i=>i.id===ingredientId);return {itemId:item.id,ingredientId,quantity:1,unit:i.unit}});
  state=applyAction(state,{type:'solicitar',date:'2026-10-11',area,requester:'Equipo',lines});
  state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Almacén',lines:lines.map(l=>({itemId:l.itemId,quantity:1}))});assert.ok(state.requests[0].closed,area);assert.ok(state.ingredients.every(configured),area);
 }
});
