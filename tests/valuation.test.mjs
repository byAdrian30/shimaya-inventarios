import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyAction} from '../lib/inventory.ts';
import {applyOpeningStock} from '../lib/opening-stock.ts';
import {inventoryValuation,editCost,costBasis} from '../lib/valuation.ts';
import {invoiceCostSource,invoiceDocuments} from '../lib/invoice-cost-source.ts';
const loaded=()=>applyOpeningStock(emptyState(),'2026-10-11T20:39:13.988Z');
test('Los cinco documentos se conciliaron con el total con IGV y se vinculan 168 insumos sin modificar stock',()=>{
 assert.equal(invoiceCostSource.length,171);assert.equal(invoiceDocuments.reduce((n,d)=>n+d.lines,0),422);assert.equal(invoiceDocuments.length,5);
 for(const d of invoiceDocuments){const value=s=>Number(s.replaceAll(',',''));assert.ok(Math.abs(Number(d.sumLines)-value(d.total))<=0.02,d.invoice);assert.ok(Math.abs(value(d.subtotal)+value(d.tax)-value(d.total))<=0.02,d.invoice);assert.ok(d.unitPricesIncludeTax)}
 const state=loaded(),copy=structuredClone(state),v=inventoryValuation(state);assert.deepEqual(state,copy);
 assert.equal(v.summary.priced,168);assert.equal(v.summary.withStockPriced,125);assert.equal(v.summary.withStockMissing,24);assert.equal(v.summary.references,1);assert.equal(v.summary.gross,24849.62);assert.equal(v.summary.net,21058.97);assert.equal(v.summary.tax,3790.65);
 assert.equal(v.rows.filter(r=>r.stock>0&&r.unitGross===null).length,24);
});
test('El precio reciente reemplaza el anterior y convierte paquetes a la unidad real del inventario',()=>{
 const v=inventoryValuation(loaded()),row=id=>v.rows.find(r=>r.ingredientId===id);
 assert.equal(row('catalog-240').unitGross,null); // salsa sin factura: no copiar el costo de la proteína Gyudon.
 const nori=v.rows.find(r=>r.name==='NORI 100 LAMINAS');assert.equal(nori.unitGross,50);assert.equal(nori.invoice,'F003-4761');
 assert.equal(row('catalog-092').unitGross,0.75);assert.equal(row('catalog-092').valueGross,45);assert.equal(row('catalog-092').unit,'Pieza suelta');
 assert.equal(row('catalog-068').unitGross,18.1);assert.equal(row('catalog-068').valueGross,2244.4);
 assert.equal(row('catalog-272').unitGross,188);assert.equal(row('catalog-003').unitGross,37.4);assert.match(row('catalog-003').conversionNote,/5 L/);
 assert.equal(row('catalog-001').unitGross,344);assert.equal(row('catalog-005').unitGross,38);assert.equal(row('catalog-215').unitGross,33);assert.equal(row('catalog-215').referenceOnly,false);
 const poligrasa=v.rows.find(r=>r.name==='POLIGRASA GRANDE ROLLO');assert.equal(poligrasa.unitGross,17.6);assert.equal(poligrasa.referenceOnly,true);
});
test('Los saldos negativos son faltantes y los precios desconocidos no se presentan como costo cero',()=>{
 const state=loaded(),ebi=state.ingredients.find(i=>i.id==='catalog-092');ebi.stock=-3;
 const v=inventoryValuation(state),row=v.rows.find(r=>r.ingredientId===ebi.id);assert.equal(row.valueGross,0);assert.equal(row.shortageGross,2.25);assert.equal(v.summary.shortageGross,2.25);assert.equal(v.summary.gross,24804.62);
 const unknown=v.rows.find(r=>r.name==='GAS BUTANO');assert.equal(unknown.unitGross,null);assert.equal(unknown.valueGross,null);
});
test('El costo manual se guarda por unidad, admite costo cero y puede restaurarse sin tocar cantidades',()=>{
 const state=loaded(),gas=state.ingredients.find(i=>i.name==='GAS BUTANO'),original=structuredClone(state),basis=costBasis(gas);
 const overrides=editCost([],state,{ingredientId:gas.id,basis,gross:9.25,note:'Proveedor local'},'2026-10-11T23:00:00Z');let v=inventoryValuation(state,overrides);assert.equal(v.rows.find(r=>r.ingredientId===gas.id).valueGross,370);assert.equal(v.summary.withStockMissing,23);assert.deepEqual(state,original);
 const free=editCost(overrides,state,{ingredientId:gas.id,basis,gross:0,note:'Bonificación'},'2026-10-11T23:00:00Z');assert.equal(inventoryValuation(state,free).rows.find(r=>r.ingredientId===gas.id).unitGross,0);
 assert.equal(editCost(overrides,state,{ingredientId:gas.id,basis,gross:null},'2026-10-11T23:00:00Z').length,0);
 for(const gross of [-1,NaN,Infinity,100000001,'9'])assert.throws(()=>editCost([],state,{ingredientId:gas.id,basis,gross,note:''},'2026-10-11T23:00:00Z'));
 assert.throws(()=>editCost([],state,{ingredientId:gas.id,basis:'kg',gross:9,note:''},'2026-10-11T23:00:00Z'),/unidad cambió/);
});
test('Los costos siguen vinculados a identificadores anteriores y el valor cambia al ingresar o despachar',()=>{
 const state=loaded();for(const i of state.ingredients){const id=i.id;i.id='legacy-'+id;for(const item of state.areaItems)if(item.ingredientId===id)item.ingredientId=i.id;}
 const v=inventoryValuation(state);assert.equal(v.summary.priced,168);assert.equal(v.summary.gross,24849.62);
 const id=state.ingredients.find(i=>i.catalogId==='catalog-092').id;
 const received=applyAction(state,{type:'recepcion',date:'2026-10-11',reference:'NUEVO',lines:[{ingredientId:id,quantity:2,unit:'paquete'}]});assert.equal(inventoryValuation(received).summary.gross,24894.62);
 assert.equal(state.ingredients.find(i=>i.id===id).stock,60);
});
