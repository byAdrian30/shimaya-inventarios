import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {emptyState,withCatalog,applyAction} from '../lib/inventory.ts';
import {areaSource} from '../lib/areas-source.ts';

registerHooks({
 resolve(specifier,context,nextResolve){
  if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:')){
   const url=new URL(specifier,context.parentURL);
   if(!path.extname(url.pathname)&&fs.existsSync(fileURLToPath(url)+'.ts'))return {url:url.href+'.ts',shortCircuit:true};
   if(!path.extname(url.pathname)&&fs.existsSync(fileURLToPath(url)+'.tsx'))return {url:url.href+'.tsx',shortCircuit:true};
  }
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  if(url.startsWith('file:')&&url.endsWith('.tsx')){
   const source=fs.readFileSync(fileURLToPath(url),'utf8');
   return {format:'module',source:ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
  }
  return nextLoad(url,context);
 }
});
const {default:RequestsDashboard,RequestDetails}=await import('../components/requests-dashboard.tsx');
const {default:InventoryDashboard}=await import('../components/inventory-dashboard.tsx');
const {default:DailyActivity}=await import('../components/daily-activity.tsx');
const {default:ValuationDashboard,ValuationSummary,soles}=await import('../components/valuation-dashboard.tsx');
const {inventoryValuation}=await import('../lib/valuation.ts');
const {applyOpeningStock}=await import('../lib/opening-stock.ts');
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
for(const role of ['admin','operator','staff'])test('La pantalla de '+role+' renderiza las 46 filas de Barra y sus nombres originales',()=>{
 const state=withCatalog(emptyState());
 const html=renderToStaticMarkup(React.createElement(RequestsDashboard,{state,mode:'pedido',busy:false,role,displayName:'Barra',userId:'test',assignedArea:'Barra',save:async()=>true,configure:()=>{}}));
 assert.equal((html.match(/class="request-item"/g)||[]).length,46);
 assert.equal((html.match(/aria-label="Cantidad solicitada de /g)||[]).length,46);
 for(const row of areaSource.filter(i=>i.area==='Barra'))assert.ok(html.includes('<strong>'+escape(row.name)+'</strong>'),row.source+' '+row.name);
 assert.equal((html.match(/<strong>PULPA DE MANGO<\/strong>/g)||[]).length,2);
 assert.equal((html.match(/<strong>SOJU<\/strong>/g)||[]).length,1);
 assert.ok(html.includes('BARRA:22'));assert.ok(html.includes('BARRA:24'));assert.ok(html.includes('Elige la presentación…'));
 assert.equal((html.match(/SOJU (?:GOOD DAY|JINRO)/g)||[]).length,6);
 assert.ok(html.includes('Sin unidad indicada en Excel'));
});
test('El dashboard muestra inventario en cero, carga de Excel y consulta por fecha sin descuentos ficticios',()=>{
 const state=withCatalog(emptyState());
 const html=renderToStaticMarkup(React.createElement(InventoryDashboard,{state,date:'2026-10-11',busy:false,onImport:()=>{},onQuery:()=>{},onInventory:()=>{},onMovement:()=>{}}));
 assert.ok(html.includes('Mi inventario actual'));assert.ok(html.includes('Cargar mi inventario'));assert.ok(html.includes('Consultar por fecha'));assert.ok(html.includes('Todavía no hay descuentos'));assert.ok(html.includes('329 insumos'));
 assert.equal((html.match(/data-label="Stock"/g)||[]).length,25);assert.equal((html.match(/data-label="Stock" class=""><strong>0<\/strong>/g)||[]).length,25);
});
test('La consulta por fecha ofrece todas las áreas y estados vacíos de pedidos y despachos',()=>{
 const html=renderToStaticMarkup(React.createElement(DailyActivity,{state:withCatalog(emptyState()),initialDate:'2026-10-11'}));
 assert.ok(html.includes('aria-label="Fecha a consultar"'));assert.ok(html.includes('value="2026-10-11"'));assert.ok(html.includes('Todas las áreas'));
 for(const area of ['Barra','Salón','Makis','Ramen','Fritura','Salteado'])assert.ok(html.includes(escape(area)));
 assert.ok(html.includes('Qué se pidió'));assert.ok(html.includes('Qué se despachó'));assert.ok(html.includes('No se realizaron pedidos'));assert.ok(html.includes('No se registraron despachos'));
});
test('El maestro ve costo y valor, cobertura parcial y el formulario manual; no se confunde un costo desconocido con cero',()=>{
 const state=applyOpeningStock(emptyState(),'2026-10-11T23:00:00Z'),data=inventoryValuation(state);
 const summary=renderToStaticMarkup(React.createElement(ValuationSummary,{data,onReload:()=>{}}));assert.ok(summary.includes(soles(24849.62)));assert.ok(summary.includes('24 insumos con stock sin precio: el total es parcial.'));assert.ok(summary.includes('Sin IGV'));
 const html=renderToStaticMarkup(React.createElement(ValuationDashboard,{data,error:'',onReload:()=>{},onSaved:()=>{}}));assert.ok(html.includes('COSTO UNITARIO CON IGV'));assert.ok(html.includes('Editar costo'));assert.ok(html.includes('Exportar costos'));assert.ok(!html.includes('ORIGEN DEL COSTO'));assert.ok(!html.includes('Origen del costo'));assert.ok(!html.includes('F003-4761'));assert.ok(!html.includes('Documentos utilizados'));
 const missing=renderToStaticMarkup(React.createElement(ValuationDashboard,{data:{...data,rows:data.rows.filter(r=>r.name==='GAS BUTANO'||r.ingredientId==='catalog-092')},error:'',onReload:()=>{},onSaved:()=>{}}));assert.ok(missing.includes('Registrar costo'));assert.ok(missing.includes('Sin valorizar'));assert.ok(missing.includes('Pieza suelta'));
 const stock=renderToStaticMarkup(React.createElement(InventoryDashboard,{state,valuation:data,date:'2026-10-11',busy:false,onImport:()=>{},onQuery:()=>{},onInventory:()=>{},onMovement:()=>{}}));assert.ok(stock.includes('COSTO UNITARIO CON IGV'));assert.ok(stock.includes('VALOR DISPONIBLE'));assert.ok(stock.includes('Sin precio'));
});

test('El detalle muestra la entrega adicional y saldo cero sin modificar la cantidad originalmente pedida',()=>{
 let state=applyOpeningStock(emptyState(),'2026-10-11T23:00:00Z');const item=state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId==='catalog-012');state=applyAction(state,{type:'solicitar',date:'2026-10-11',area:'Makis',requester:'Equipo',lines:[{itemId:item.id,quantity:3,unit:'kg'}]});state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Almacén',lines:[{itemId:item.id,quantity:5}]});
 const html=renderToStaticMarkup(React.createElement(RequestDetails,{r:state.requests[0]}));assert.ok(html.includes('data-label="Solicitado">3 kg'));assert.ok(html.includes('data-label="Entregado">5 kg'));assert.ok(html.includes('Adicional: 2 kg'));assert.ok(html.includes('data-label="Saldo">0 kg'));assert.ok(!html.includes('data-label="Saldo">-'));
 const screen=renderToStaticMarkup(React.createElement(RequestsDashboard,{state,mode:'despacho',busy:false,role:'operator',displayName:'Almacén',userId:'op',save:async()=>true,configure:()=>{}}));assert.ok(screen.includes('En Parcial puedes registrar una cantidad igual o mayor a lo pedido'));
});

const {SharedContent,AreaCatalog}=await import('../components/shared-admin.tsx');
test('La administración compartida tiene todos los apartados, costos y reportes, sin controles que modifiquen datos',()=>{
 const state=applyOpeningStock(emptyState(),'2026-10-11T23:00:00Z'),data={role:'viewer',readOnly:true,state,revision:3,valuation:inventoryValuation(state),members:[{email:'cocina@example.com',name:'Cocina',area:'Makis',role:'operator',status:'active',createdAt:'2026-10-11',updatedAt:'2026-10-11'}]};
 const render=tab=>renderToStaticMarkup(React.createElement(SharedContent,{data,token:'test-only-readonly-token-012345678901234567890',onReload:()=>{},initialTab:tab}));
 for(const tab of ['inicio','stock','valores','ingreso','pedido','despacho','ordenes','consulta','catalogo','historial','equipo']){
  const html=render(tab);assert.ok(html.includes('Administración · Solo lectura'));assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  for(const forbidden of ['Cargar mi inventario','Registrar stock','Editar costo','Registrar costo','Guardar costo','Confirmar ingreso','Autorizar por correo','Guardar permisos','Aprobar acceso','Suspender','Enviar pedido','Confirmar despacho','Eliminar orden','Revertir movimiento','type="number"','type="file"','<form'])assert.ok(!html.includes(forbidden),tab+': '+forbidden);
 }
 const summary=render('inicio');assert.ok(summary.includes('COSTO UNITARIO CON IGV'));assert.ok(summary.includes('Últimos descuentos'));assert.ok(summary.includes('Ver inventario'));
 const costs=render('valores');assert.ok(costs.includes('Inventario valorizado'));assert.ok(costs.includes('Exportar costos'));assert.ok(!costs.includes('ORIGEN DEL COSTO'));
 const report=render('consulta');assert.ok(report.includes('Descargar PDF diario por áreas'));assert.ok(report.includes('Qué se pidió'));assert.ok(report.includes('Qué se despachó'));
 const teamHtml=render('equipo');assert.ok(teamHtml.includes('cocina@example.com'));assert.ok(teamHtml.includes('Pedido y despacho'));assert.ok(!teamHtml.includes('<select'));
 const catalog=renderToStaticMarkup(React.createElement(AreaCatalog,{state:withCatalog(emptyState())}));assert.equal((catalog.match(/data-label="Ítem \/ área"/g)||[]).length,46);assert.ok(catalog.includes('46 ítems'));
});

test('Pedidos, despachos, ingresos y comprobantes conservan su detalle en la vista compartida',()=>{
 let state=applyOpeningStock(emptyState(),'2026-10-11T23:00:00Z');const item=state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId==='catalog-012');state=applyAction(state,{type:'solicitar',date:'2026-10-12',area:'Makis',requester:'Cocina',note:'Pedido de prueba',lines:[{itemId:item.id,quantity:3,unit:'kg'}]});state=applyAction(state,{type:'despachar',date:'2026-10-12',requestId:state.requests[0].id,dispatcher:'Almacén',note:'Entrega adicional',lines:[{itemId:item.id,quantity:5}]});
 state.movements.unshift({id:'receipt-test',date:'2026-10-12',at:'2026-10-12T17:00:00Z',kind:'recepcion',reference:'Factura de Lima',note:'Recepción verificada',photos:[],document:{hash:'a'.repeat(64),name:'factura-lima.pdf'},lines:[{ingredientId:'catalog-012',name:'AJONJOLI BLANCO',unit:'kg',delta:2,before:1,after:3}]});
 const data={role:'viewer',readOnly:true,state,revision:3,valuation:inventoryValuation(state),members:[]};const render=tab=>renderToStaticMarkup(React.createElement(SharedContent,{data,token:'test-only-readonly-token-012345678901234567890',onReload:()=>{},initialTab:tab}));
 for(const tab of ['pedido','despacho','ordenes']){const html=render(tab);assert.ok(html.includes('Pedido de prueba'));assert.ok(html.includes('data-label="Solicitado">3 kg'));assert.ok(html.includes('data-label="Entregado">5 kg'));assert.ok(html.includes('Adicional: 2 kg'));assert.ok(html.includes('Entrega adicional'));}
 for(const tab of ['ingreso','historial']){const html=render(tab);assert.ok(html.includes('Factura de Lima'));assert.ok(html.includes('Recepción verificada'));assert.ok(html.includes('Descargar PDF: factura-lima.pdf'));assert.ok(html.includes('data-label="Antes">1 kg'));assert.ok(html.includes('data-label="Después">3 kg'));}
});

const {StockList}=await import('../components/stock-consultation.tsx');
test('Stock disponible muestra saldos, unidades y filtros de consulta sin controles de modificación ni precios',()=>{
 const items=[{id:'positive',name:'ARROZ',category:'Abarrotes',unit:'kg',stock:7.25,configured:true,unitNote:'Control por kilogramo',noOrder:false},{id:'zero',name:'NORI',category:'Abarrotes',unit:'paquete',stock:0,configured:true,unitNote:'',noOrder:false},{id:'negative',name:'EBI FURAI',category:'Congelados',unit:'Pieza suelta',stock:-2,configured:true,unitNote:'30 piezas por paquete',noOrder:false}];
 const html=renderToStaticMarkup(React.createElement(StockList,{items,updatedAt:'18:45:00',onReload:()=>{}}));assert.ok(html.includes('Solo lectura'));assert.ok(html.includes('aria-label="Buscar en stock disponible"'));assert.ok(html.includes('aria-label="Filtrar stock disponible"'));assert.ok(html.includes('Actualizar stock'));assert.ok(html.includes('15 segundos'));assert.ok(html.includes('18:45:00'));
 assert.equal((html.match(/data-label="Stock actual"/g)||[]).length,3);assert.ok(html.includes('7.25'));assert.ok(html.includes('>0</strong>'));assert.ok(html.includes('>-2</strong>'));assert.ok(html.includes('Pieza suelta'));assert.ok(html.includes('Faltante'));assert.ok(html.includes('En cero'));
 for(const forbidden of ['<form','type="number"','type="file"','Conteo físico','Guardar conteo','Importar Excel','Registrar merma','Nuevo insumo','Configurar','Editar','COSTO UNITARIO','VALOR DISPONIBLE'])assert.ok(!html.includes(forbidden),forbidden);
});

const {withAddedItems}=await import('../lib/added-items.ts');
test('El personal ve las nuevas opciones de tamarindo en Barra y paquete de poro en Ramen con las unidades del inventario',()=>{
 const state=withAddedItems(withCatalog(emptyState()));
 for(const [area,name,unit] of [['Barra','PULPA DE TAMARINDO','Unidad'],['Ramen','PAQUETE DE PORO','Paquete']]){
  const html=renderToStaticMarkup(React.createElement(RequestsDashboard,{state,mode:'pedido',busy:false,role:'operator',displayName:'Personal',userId:'test',assignedArea:area,save:async()=>true,configure:()=>{}}));
  assert.ok(html.includes('<strong>'+name+'</strong>'));assert.ok(html.includes('aria-label="Cantidad solicitada de '+name+'"'));assert.ok(html.includes(unit));
  if(area==='Barra')assert.equal((html.match(/class="request-item"/g)||[]).length,47);else assert.ok(html.includes('<strong>PORO</strong>'));
 }
});
