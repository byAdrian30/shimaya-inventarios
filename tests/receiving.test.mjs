import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOpeningStock} from '../lib/opening-stock.ts';
import {emptyState,applyAction,withCatalog} from '../lib/inventory.ts';
import {matchReceiptItem,parseReceivingText,receiptAmount} from '../lib/receiving.ts';
import {pdfTextLines} from '../lib/pdf-text.ts';
const fixture=()=>applyOpeningStock(emptyState(),'2026-10-11T20:00:00Z');
test('El ingreso suma a los saldos y convierte paquetes de Ebi furai a piezas sin multiplicar Chashu',()=>{
 let state=fixture();const before=structuredClone(state),hash='a'.repeat(64);
 const action={type:'recepcion',operationId:'goods-001',date:'2026-10-12',reference:'LIMA-001',document:{hash,name:'guia.pdf'},lines:[{ingredientId:'catalog-092',quantity:2,unit:'paquete'},{ingredientId:'catalog-068',quantity:3,unit:'und'},{ingredientId:'catalog-182',quantity:500,unit:'g'}]};
 state=applyAction(state,action);assert.equal(state.ingredients.find(i=>i.id==='catalog-092').stock,120);assert.equal(state.ingredients.find(i=>i.id==='catalog-068').stock,127);assert.equal(state.ingredients.find(i=>i.id==='catalog-182').stock,5.355);assert.equal(state.movements[0].lines.length,3);assert.equal(state.movements[0].document.hash,hash);assert.equal(before.ingredients.find(i=>i.id==='catalog-092').stock,60);
 assert.deepEqual(applyAction(state,action),state);assert.throws(()=>applyAction(state,{...action,operationId:'different'}),/documento.*registró/i);assert.throws(()=>applyAction(state,{...action,operationId:'different',reference:'LIMA-002'}),/PDF.*registró/i);
 const restored=applyAction(state,{type:'revertir',id:action.operationId,date:'2026-10-12'});assert.equal(restored.ingredients.find(i=>i.id==='catalog-092').stock,60);assert.equal(restored.ingredients.find(i=>i.id==='catalog-068').stock,124);
});
test('Una entrada parcial regulariza un saldo negativo; líneas inválidas abortan sin cambios',()=>{
 const state=fixture();state.ingredients.find(i=>i.id==='catalog-092').stock=-8;
 const action={type:'recepcion',date:'2026-10-12',reference:'PARCIAL',lines:[{ingredientId:'catalog-092',quantity:2,unit:'und'}]};
 assert.equal(applyAction(state,action).ingredients.find(i=>i.id==='catalog-092').stock,-6);
 const snapshot=structuredClone(state);assert.throws(()=>applyAction(state,{...action,lines:[...action.lines,{ingredientId:'catalog-182',quantity:1,unit:'caja'}]}),/incompatible/i);assert.deepEqual(state,snapshot);
 for(const quantity of [0,-1,NaN,1e10])assert.throws(()=>receiptAmount(state.ingredients[0],quantity,'und'));
});
test('Un producto nuevo se configura y puede asignarse a un área sin perder las filas del Excel',()=>{
 const state=applyAction(fixture(),{type:'recepcion',operationId:'new-product',date:'2026-10-12',reference:'NUEVOS',lines:[{isNew:true,name:'Salsa nueva del proveedor',quantity:4,unit:'bolsa',area:'Makis'}]});
 const i=state.ingredients.find(i=>i.name==='Salsa nueva del proveedor');assert.equal(i.stock,4);assert.equal(i.configured,true);assert.deepEqual(state.areaItems.slice(0,240),fixture().areaItems);
 const item=state.areaItems.find(item=>item.ingredientId===i.id);assert.equal(item.area,'Makis');assert.equal(item.referenceUnit,'bolsa');
 const request=applyAction(state,{type:'solicitar',date:'2026-10-12',area:'Makis',requester:'Equipo',lines:[{itemId:item.id,quantity:1,unit:'bolsa'}]});assert.equal(request.requests[0].lines[0].name,i.name);
 delete request.areasVersion;const updated=withCatalog(request);assert.ok(updated.areaItems.find(a=>a.id===item.id).active!==false);assert.ok(updated.areaItems.find(a=>a.id==='opening-area-stock-blenddemargarita').active!==false);
});
test('El lector relaciona alias y cantidades, conserva productos nuevos y exige elegir nombres ambiguos',()=>{
 const {ingredients}=fixture();const rows=parseReceivingText('Layu 5\n2 paquetes EBI FURAI PAQUETE DE 30 UNIDADES\nSalmon 0.500 kg\nProducto totalmente nuevo 3\nKaen 2\nTOTAL 999',ingredients);
 assert.equal(rows.length,5);assert.equal(rows[0].ingredientId,'catalog-122');assert.equal(rows[0].quantity,5);assert.equal(rows[0].selected,true);
 assert.equal(rows[1].ingredientId,'catalog-092');assert.equal(rows[1].quantity,2);assert.equal(rows[1].unit,'paquete');assert.equal(rows[1].selected,true);
 assert.equal(rows[2].ingredientId,'catalog-182');assert.equal(rows[2].quantity,.5);assert.equal(rows[2].unit,'kg');
 assert.equal(rows[3].isNew,true);assert.equal(rows[3].selected,false);assert.equal(rows[4].ingredientId,'');assert.match(rows[4].warning,/presentación/);
 assert.equal(matchReceiptItem('Gyudon',ingredients).length,2);
});
test('Tablas de guía con código y precios usan la columna cantidad y no precios o tamaños',()=>{
 const {ingredients}=fixture();const text='Código | Cantidad | Unidad | Descripción | Precio | Total\n020 | 2.480 | kg | BARRAS DE ATUN | 80 | 198.40\n092 | 2 | paquete | EBI FURAI PAQUETE DE 30 UNIDADES | 50 | 100';
 const rows=parseReceivingText(text,ingredients);assert.equal(rows.length,2);assert.equal(rows[0].ingredientId,'catalog-020');assert.equal(rows[0].quantity,2.48);assert.equal(rows[1].ingredientId,'catalog-092');assert.equal(rows[1].quantity,2);assert.equal(rows[1].unit,'paquete');
 const ambiguous=parseReceivingText('POLVO GUACAMOLE X 500GR',ingredients);assert.equal(ambiguous[0].selected,false);assert.equal(ambiguous[0].quantity,0);
});
test('La extracción conserva filas y columnas sin unir renglones de distinta altura',()=>{
 const item=(str,x,y,width=20)=>({str,transform:[1,0,0,10,x,y],width});
 const text=pdfTextLines([item('2',180,700),item('SALSA KAEN',10,700,90),item('BARRAS DE ATUN',10,680,95),item('2.48',180,680)]);assert.equal(text,'SALSA KAEN\t2\nBARRAS DE ATUN\t2.48');
});
