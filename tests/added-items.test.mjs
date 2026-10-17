import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,withCatalog,applyAction} from '../lib/inventory.ts';
import {withAddedItems,addedItemsVersion} from '../lib/added-items.ts';
import {areaSource} from '../lib/areas-source.ts';

test('Tamarindo y paquete de poro usan el inventario existente, conservan saldos e historial y se agregan una sola vez a sus áreas',()=>{
 let state=withAddedItems(withCatalog(emptyState()));
 state.areaItems=state.areaItems.filter(i=>!['manual-area-barra-pulpa-tamarindo','manual-area-ramen-paquete-poro'].includes(i.id));state.addedItemsVersion='makis-arroz-personal-v1';
 const tamarind=state.ingredients.find(i=>i.id==='catalog-217'),leek=state.ingredients.find(i=>i.id==='catalog-180');tamarind.stock=11;leek.stock=-20;
 const originalPoro=state.areaItems.find(i=>i.id==='area-salsas-76');state=applyAction(state,{type:'solicitar',date:'2026-10-16',area:'Ramen',requester:'Pedido anterior',lines:[{itemId:originalPoro.id,quantity:2,unit:'paquete'}]});
 const before=structuredClone(state),updated=withAddedItems(state);
 assert.deepEqual(state,before);assert.deepEqual(updated.ingredients,before.ingredients);assert.deepEqual(updated.requests,before.requests);assert.deepEqual(updated.movements,before.movements);assert.equal(updated.addedItemsVersion,addedItemsVersion);
 const tamarindRow=updated.areaItems.find(i=>i.area==='Barra'&&i.name==='PULPA DE TAMARINDO'),leekRow=updated.areaItems.find(i=>i.area==='Ramen'&&i.name==='PAQUETE DE PORO');assert.ok(tamarindRow);assert.ok(leekRow);
 assert.equal(tamarindRow.ingredientId,tamarind.id);assert.equal(leekRow.ingredientId,leek.id);assert.equal(tamarindRow.referenceUnit,'Unidad');assert.equal(leekRow.referenceUnit,'Paquete');assert.equal(tamarindRow.active,true);assert.equal(leekRow.active,true);assert.equal(updated.ingredients.find(i=>i.id===tamarind.id).stock,11);assert.equal(updated.ingredients.find(i=>i.id===leek.id).stock,-20);
 assert.deepEqual(updated.areaItems.find(i=>i.id===originalPoro.id),originalPoro);for(const row of areaSource)assert.ok(updated.areaItems.some(i=>i.id===row.id&&i.name===row.name&&i.area===row.area));
 assert.equal(withAddedItems(updated),updated);const repeated=structuredClone(updated);delete repeated.addedItemsVersion;const migrated=withAddedItems(repeated);assert.deepEqual(migrated,updated);
 delete migrated.areasVersion;const future=withAddedItems(withCatalog(migrated));for(const row of [tamarindRow,leekRow]){assert.equal(future.areaItems.filter(i=>i.id===row.id).length,1);assert.equal(future.areaItems.find(i=>i.id===row.id).active,true)}assert.equal(future.ingredients.find(i=>i.id===tamarind.id).stock,11);assert.equal(future.ingredients.find(i=>i.id===leek.id).stock,-20);
});

test('La incorporación reconoce códigos antiguos y una fila de Barra ya creada sin duplicarla ni cambiar su unidad',()=>{
 const state=withAddedItems(withCatalog(emptyState()));state.addedItemsVersion='makis-arroz-personal-v1';
 const ingredient=state.ingredients.find(i=>i.id==='catalog-217');ingredient.id='legacy-tamarindo';ingredient.stock=7;const row=state.areaItems.find(i=>i.area==='Barra'&&i.name==='PULPA DE TAMARINDO');row.id='custom-tamarindo';row.name='Pulpa de tamarindo x 1kg';row.ingredientId=ingredient.id;
 const before=state.ingredients.length,updated=withAddedItems(state);assert.equal(updated.ingredients.length,before);assert.equal(updated.ingredients.filter(i=>i.catalogId==='catalog-217').length,1);assert.equal(updated.ingredients.find(i=>i.id==='legacy-tamarindo').stock,7);assert.equal(updated.ingredients.find(i=>i.id==='legacy-tamarindo').unit,'und');
 const rows=updated.areaItems.filter(i=>i.area==='Barra'&&i.ingredientId===ingredient.id);assert.equal(rows.length,1);assert.equal(rows[0].id,'custom-tamarindo');assert.equal(rows[0].name,'PULPA DE TAMARINDO');assert.equal(rows[0].referenceUnit,'Unidad');
});
