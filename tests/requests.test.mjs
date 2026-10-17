import test from 'node:test';
import assert from 'node:assert/strict';
import {applyAction,emptyState,withCatalog} from '../lib/inventory.ts';
import {canPerform,requestStatus,orderRestocks,pendingQuantity,additionalQuantity,dispatchQuantity} from '../lib/requests.ts';
import {convert} from '../lib/inventory.ts';
const act=(s,a)=>applyAction(s,{date:'2026-10-09',...a});
function fixture(){let s=withCatalog(emptyState());const names=['AJONJOLI BLANCO','AJONJOLI NEGRO'];for(const name of names){const i=s.ingredients.find(i=>i.name===name);s=act(s,{type:'ingredient',id:i.id,name,stock:10,minimum:0,unit:'kg'})}return s;}
function request(s,quantity=3){const item=s.areaItems.find(i=>i.ingredientId==='catalog-012');return act(s,{type:'solicitar',area:item.area,requester:'Cocina',actorId:'staff-1',lines:[{itemId:item.id,quantity,unit:'kg'}]})}
const dispatch=(s,quantity,close=false,extra={})=>act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:s.requests[0].lines.map(l=>({itemId:l.itemId,quantity})),close,...extra});
test('Seis áreas tienen las 237 filas del Excel, sin stock inventado ni filas sin inventario',()=>{const s=withCatalog(emptyState());assert.equal(s.areaItems.filter(i=>i.active!==false).length,237);assert.equal(s.areaItems.filter(i=>i.active!==false&&!i.ingredientId&&!i.ingredientOptions?.length).length,0);assert.deepEqual([...new Set(s.areaItems.map(i=>i.area))].sort(),['Barra','Fritura','Makis','Ramen','Salteado','Salón'].sort());assert.ok(s.areaItems.every(i=>!i.name.includes('DESCANSO')));assert.equal(s.requests.length,0);assert.equal(s.ingredients.filter(i=>i.configured).length,0);assert.equal(s.areaItems.filter(i=>i.name==='PULPA DE MANGO'&&i.area==='Barra').length,2)});
test('Enviar pedido guarda cantidades y responsable sin afectar stock',()=>{const s=fixture(),n=request(s);assert.equal(n.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,10);assert.equal(n.requests[0].lines[0].quantity,3);assert.equal(n.requests[0].lines[0].delivered,0);assert.equal(n.requests[0].actorId,'staff-1');assert.equal(n.movements[0].lines.length,0);assert.equal(n.movements[0].kind,'solicitud')});
test('Despacho parcial descuenta solo entrega; el saldo admite otro despacho completo',()=>{let s=request(fixture(),3);s=dispatch(s,1);assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,9);assert.equal(s.requests[0].lines[0].delivered,1);assert.equal(s.requests[0].closed,false);assert.equal(requestStatus(s.requests[0]),'Parcial · pendiente');s=dispatch(s,2);assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,7);assert.equal(s.requests[0].closed,true);assert.equal(requestStatus(s.requests[0]),'Completo');assert.throws(()=>dispatch(s,1),/cerrado/)});
test('Nada cierra pedido sin descontar ningún insumo',()=>{const s=dispatch(request(fixture()),0,true);assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,10);assert.equal(requestStatus(s.requests[0]),'Sin despacho');assert.equal(s.movements[0].lines.length,0)});
test('Cerrar parcial registra saldo no entregado y rechaza cantidades inválidas',()=>{const s=request(fixture(),3);for(const q of [-1,NaN,Infinity,100000001])assert.throws(()=>dispatch(s,q));const n=dispatch(s,1,true);assert.equal(requestStatus(n.requests[0]),'Parcial · cerrado');assert.equal(n.requests[0].lines[0].quantity-n.requests[0].lines[0].delivered,2)});
test('El despacho confirma todas las líneas aunque una exceda el stock; solo su faltante queda negativo',()=>{let s=fixture();const items=s.areaItems.filter(i=>i.area==='Makis'&&['catalog-012','catalog-013'].includes(i.ingredientId));s=act(s,{type:'solicitar',area:'Makis',requester:'Equipo',lines:items.map((i,n)=>({itemId:i.id,quantity:n?20:1,unit:'kg'}))});const n=act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:s.requests[0].lines.map(l=>({itemId:l.itemId,quantity:l.quantity}))});assert.equal(n.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,9);assert.equal(n.ingredients.find(i=>i.name==='AJONJOLI NEGRO').stock,-10);assert.ok(n.requests[0].lines.every(l=>l.delivered===l.quantity));assert.equal(requestStatus(n.requests[0]),'Completo');assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,10)});
test('Reintento del mismo despacho no vuelve a descontar; reversión reabre y restaura saldo',()=>{let s=request(fixture());s=dispatch(s,3,false,{operationId:'dispatch-one'});s=dispatch(s,3,false,{operationId:'dispatch-one'});assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,7);s=act(s,{type:'revertir',id:'dispatch-one'});assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,10);assert.equal(s.requests[0].lines[0].delivered,0);assert.equal(s.requests[0].closed,false);assert.ok(s.requests[0].dispatches[0].reversed)});
test('Rechaza insumos de otras áreas, duplicados y unidades inventadas',()=>{const s=fixture(),i=s.areaItems.find(i=>i.ingredientId==='catalog-012');const a={type:'solicitar',area:'Makis',requester:'Equipo',lines:[{itemId:i.id,quantity:1,unit:'kg'}]};assert.throws(()=>act(s,{...a,area:'Ramen'}),/ajeno/);assert.throws(()=>act(s,{...a,lines:[...a.lines,...a.lines]}),/repetido/);assert.throws(()=>act(s,{...a,lines:[{...a.lines[0],unit:'inventada'}]}),/unidad/)});
test('Un insumo ausente del catálogo sigue disponible y se despacha sin stock inicial',()=>{let s=fixture();const item=s.areaItems.find(i=>i.name==='COULIS DE FRAMBUESA');assert.equal(item.active,true);const ingredient=s.ingredients.find(i=>i.id===item.ingredientId);assert.equal(ingredient.stock,0);assert.equal(ingredient.configured,false);s=act(s,{type:'solicitar',area:item.area,requester:'Barra',lines:[{itemId:item.id,quantity:2,unit:'und'}]});s=dispatch(s,2);assert.equal(s.requests[0].lines[0].name,'COULIS DE FRAMBUESA');assert.equal(s.ingredients.find(i=>i.id===ingredient.id).stock,-2)});
test('Dos líneas vinculadas al mismo stock se acumulan y se revierten sin pérdida',()=>{let s=fixture();const items=s.areaItems.filter(i=>i.area==='Makis').slice(0,2),i=s.ingredients.find(i=>i.name==='AJONJOLI BLANCO');s=act(s,{type:'vincular-areas',links:items.map(item=>({itemId:item.id,ingredientId:i.id}))});s=act(s,{type:'solicitar',area:'Makis',requester:'Equipo',lines:items.map(item=>({itemId:item.id,quantity:2,unit:'kg'}))});s=act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:items.map(item=>({itemId:item.id,quantity:2}))});const m=s.movements[0];assert.equal(m.lines.length,1);assert.equal(m.lines[0].delta,-4);s=act(s,{type:'revertir',id:m.id});assert.equal(s.ingredients.find(x=>x.id===i.id).stock,10)});
test('Pedido solo solicita y Solo despacho únicamente confirma entregas',()=>{assert.equal(canPerform('staff','solicitar'),true);assert.equal(canPerform('guest','solicitar'),false);for(const t of ['despachar','entrada','conteo','vincular-areas','revertir'])assert.equal(canPerform('staff',t),false);assert.equal(canPerform('dispatch','despachar'),true);for(const t of ['solicitar','ingredient','entrada','merma','conteo','importar','vincular-area','vincular-areas','revertir','pedido'])assert.equal(canPerform('dispatch',t),false);assert.equal(canPerform('admin','despachar'),true);const s=withCatalog(emptyState()),i=s.areaItems.find(i=>i.sourceName==='RABANITO');assert.equal(s.ingredients.find(x=>x.id===i.ingredientId).name,'RABANO')});
test('El perfil combinado permite ambas tareas y no permite ajustes, importaciones ni reversión',()=>{for(const type of ['solicitar','despachar'])assert.equal(canPerform('operator',type),true);for(const type of ['ingredient','conteo','entrada','merma','importar','vincular-area','vincular-areas','revertir','pedido','approve'])assert.equal(canPerform('operator',type),false)});
test('Actualización conserva las dos filas de aceite Yakitori con stock común e historial',()=>{let s=fixture();delete s.catalogVersion;s.areaItems=s.areaItems.filter(i=>i.id!=='area-salsas-63');const n=withCatalog(s);const oil=n.areaItems.filter(i=>i.ingredientId==='catalog-005'&&i.area==='Salteado'&&i.active!==false);assert.equal(oil.length,2);assert.deepEqual(n.ingredients.map(i=>i.stock),s.ingredients.map(i=>i.stock));assert.deepEqual(n.movements,s.movements)});

const remove=(s,extra={})=>act(s,{type:'eliminar-orden',requestId:s.requests[0].id,deletedBy:'Adrian',actorId:'admin-1',note:'Pedido duplicado',...extra});
test('Se puede pedir con stock cero, sin stock registrado y con unidad de control pendiente de corregir',()=>{
 for(const mode of ['sin-configurar','cero','unidad-pendiente']){
  let s=withCatalog(emptyState());const i=s.ingredients.find(i=>i.name==='AJONJOLI BLANCO');
  if(mode!=='sin-configurar'){i.configured=true;i.stock=0;if(mode==='unidad-pendiente'){i.unit='und';i.unitIssue='Recuenta en kg'}}
  const before=structuredClone(s.ingredients),n=request(s,25);assert.equal(n.requests[0].lines[0].quantity,25);assert.deepEqual(n.ingredients,before);
  if(mode==='unidad-pendiente')assert.throws(()=>dispatch(n,1),/Revisa la unidad/);
  else{const delivered=dispatch(n,1);assert.equal(delivered.ingredients.find(x=>x.id===i.id).stock,-1);assert.equal(delivered.requests[0].lines[0].delivered,1);assert.equal(delivered.ingredients.find(x=>x.id===i.id).configured,true)}
  assert.equal(n.requests[0].lines[0].delivered,0);
 }
});
test('Pedir sin stock conserva la restricción explícita NO PEDIR',()=>{const s=fixture();s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').noOrder=true;assert.throws(()=>request(s),/NO PEDIR/)});
test('Eliminar una orden pendiente conserva stock, historial y numeración; reintentar es idempotente',()=>{
 const initial=request(fixture()),n=remove(initial,{operationId:'delete-pending'});
 assert.equal(n.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,10);assert.equal(n.requests[0].closed,true);assert.equal(requestStatus(n.requests[0]),'Eliminada');assert.equal(n.requests[0].deleted.by,'Adrian');assert.equal(n.requests[0].deleted.actorId,'admin-1');assert.equal(n.requests[0].deleted.note,'Pedido duplicado');assert.equal(n.movements[0].kind,'eliminar-orden');assert.equal(n.movements[0].lines.length,0);
 assert.deepEqual(remove(n,{operationId:'delete-pending'}),n);assert.throws(()=>remove(n),/ya fue eliminada/);assert.throws(()=>dispatch(n,1),/eliminado/);
 assert.equal(request(n).requests[0].number,'PED-00002');assert.equal(initial.requests[0].deleted,undefined);
});
test('Eliminar despachos parciales y completos devuelve solo sus salidas no revertidas',()=>{
 let s=request(fixture());s=dispatch(s,1,false,{operationId:'already-reversed'});s=act(s,{type:'revertir',id:'already-reversed'});s=dispatch(s,1);s=dispatch(s,2);
 const original=s.requests[0],preview=orderRestocks(s,original,convert);assert.equal(preview[0].quantity,3);assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,7);
 const n=remove(s,{operationId:'delete-dispatched'});assert.equal(n.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,10);assert.equal(n.movements[0].lines[0].delta,3);assert.equal(n.requests[0].lines[0].delivered,3);assert.ok(n.requests[0].dispatches.every(d=>d.reversed));assert.ok(n.movements.filter(m=>m.kind==='despacho').every(m=>m.reversed));assert.equal(n.requests[0].deleted.movementId,'delete-dispatched');
 assert.throws(()=>act(n,{type:'revertir',id:'delete-dispatched'}),/no se puede revertir/);assert.throws(()=>act(n,{type:'revertir',id:original.dispatches[1].id}),/no se puede revertir/);
});
test('Eliminar una orden cerrada sin entregas no cambia el inventario',()=>{const s=dispatch(request(fixture()),0,true),n=remove(s);assert.deepEqual(n.ingredients,s.ingredients);assert.equal(n.movements[0].lines.length,0);assert.ok(n.requests[0].dispatches[0].reversed)});
test('La devolución usa las salidas registradas y su conversión, sin reemplazar conteos posteriores',()=>{
 const s=dispatch(request(fixture()),1),i=s.ingredients.find(i=>i.name==='AJONJOLI BLANCO');i.unit='g';i.stock=6000;
 const n=remove(s);assert.equal(n.ingredients.find(x=>x.id===i.id).stock,7000);assert.equal(n.movements[0].lines[0].unit,'g');assert.equal(n.movements[0].lines[0].delta,1000);
});
test('Una devolución incompleta aborta sin modificar stock ni eliminar la orden',()=>{
 let s=fixture();const items=s.areaItems.filter(i=>i.area==='Makis'&&['catalog-012','catalog-013'].includes(i.ingredientId));s=act(s,{type:'solicitar',area:'Makis',requester:'Equipo',lines:items.map(i=>({itemId:i.id,quantity:2,unit:'kg'}))});s=act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:items.map(i=>({itemId:i.id,quantity:1}))});
 s.ingredients=s.ingredients.filter(i=>i.name!=='AJONJOLI NEGRO');const before=structuredClone(s);assert.throws(()=>remove(s),/No se encontró el insumo/);assert.deepEqual(s,before);
 const missing=dispatch(request(fixture()),1);missing.movements=missing.movements.filter(m=>m.kind!=='despacho');assert.throws(()=>remove(missing),/verificar el stock/);assert.equal(missing.requests[0].deleted,undefined);
});
test('Nori y verduras compartidos conservan cada área del Excel, con pedidos y stock común independientes',()=>{
 let s=withCatalog(emptyState());
 for(const [sourceName,areas] of [['NORI',['Ramen','Salteado']],['ZANAHORIA',['Fritura','Ramen']],['CEBOLLA CHINA',['Ramen','Salteado']]])assert.deepEqual([...new Set(s.areaItems.filter(i=>i.active!==false&&i.sourceName===sourceName).map(i=>i.area))].sort(),areas.sort());
 const i=s.ingredients.find(i=>i.catalogId==='catalog-142'),items=s.areaItems.filter(a=>a.active!==false&&a.ingredientId===i.id);assert.equal(items.length,2);assert.equal(new Set(items.map(i=>i.id)).size,2);
 s=act(s,{type:'ingredient',id:i.id,name:i.name,stock:20,minimum:0,unit:i.unit});
 for(const item of items)s=act(s,{type:'solicitar',area:item.area,requester:item.area,lines:[{itemId:item.id,quantity:5,unit:i.unit}]});
 for(const [index,r] of s.requests.entries())s=act(s,{type:'despachar',requestId:r.id,dispatcher:'Almacén',lines:r.lines.map(l=>({itemId:l.itemId,quantity:index+2}))});
 assert.equal(s.ingredients.find(x=>x.id===i.id).stock,15);assert.equal(s.requests[0].lines[0].delivered,2);assert.equal(s.requests[1].lines[0].delivered,3);
 const n=remove(s);assert.equal(n.ingredients.find(x=>x.id===i.id).stock,17);assert.equal(n.requests[1].deleted,undefined);assert.equal(n.requests[1].lines[0].delivered,3);
});
test('Una actualización respeta el área del Excel y conserva pedidos anteriores',()=>{
 const s=request(fixture());delete s.catalogVersion;const item=s.areaItems.find(i=>i.sourceName==='NORI'&&i.area==='Ramen');item.area='Makis';
 const n=withCatalog(s);assert.equal(n.areaItems.find(i=>i.id===item.id).area,'Ramen');assert.deepEqual(n.requests,s.requests);assert.deepEqual(n.movements,s.movements);assert.deepEqual(n.ingredients.map(i=>i.stock),s.ingredients.map(i=>i.stock));
});
test('Solo administración puede eliminar órdenes y tiene acceso a su apartado',()=>{assert.equal(canPerform('admin','eliminar-orden'),true);for(const role of ['operator','staff','dispatch','guest','invalid'])assert.equal(canPerform(role,'eliminar-orden'),false)});

test('Desde stock cero se permite despacho parcial y completo; un reintento no vuelve a descontar',()=>{
 let s=request(withCatalog(emptyState()));s=dispatch(s,1,false,{operationId:'negative-partial'});assert.equal(requestStatus(s.requests[0]),'Parcial · pendiente');assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,-1);
 s=dispatch(s,2,false,{operationId:'negative-complete'});assert.equal(requestStatus(s.requests[0]),'Completo');assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,-3);assert.equal(s.movements[0].lines[0].before,-1);assert.equal(s.movements[0].lines[0].after,-3);assert.equal(s.movements[0].lines[0].delta,-2);
 assert.deepEqual(dispatch(s,2,false,{operationId:'negative-complete'}),s);
});
test('Un insumo sin stock inicial usa su unidad del catálogo al despachar',()=>{
 let s=withCatalog(emptyState());const i=s.ingredients.find(i=>i.name==='AJONJOLI BLANCO');i.unit='';const n=dispatch(request(s,0.75),0.25);const ingredient=n.ingredients.find(x=>x.id===i.id);
 assert.equal(ingredient.unit,'kg');assert.equal(ingredient.stock,-0.25);assert.equal(ingredient.configured,true);assert.equal(n.movements[0].lines[0].unit,'kg');assert.equal(i.configured,false);assert.equal(i.stock,0);
});
test('Eliminar y revertir órdenes con stock negativo regulariza solo su propio descuento',()=>{
 let s=dispatch(request(withCatalog(emptyState()),3),3),firstId=s.requests[0].id;s=dispatch(request(s,2),2);const secondId=s.requests[0].id,secondMovement=s.movements[0].id;
 assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,-5);assert.equal(orderRestocks(s,s.requests.find(r=>r.id===firstId),convert)[0].quantity,3);
 s=remove(s,{requestId:firstId,operationId:'delete-negative'});assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,-2);assert.equal(s.requests.find(r=>r.id===secondId).deleted,undefined);assert.equal(s.movements[0].lines[0].before,-5);assert.equal(s.movements[0].lines[0].after,-2);
 s=act(s,{type:'revertir',id:secondMovement});assert.equal(s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').stock,0);assert.equal(s.requests.find(r=>r.id===secondId).closed,false);assert.equal(s.requests.find(r=>r.id===secondId).lines[0].delivered,0);
});
test('Entradas parciales y conteos físicos permiten regularizar un saldo negativo',()=>{
 let s=dispatch(request(withCatalog(emptyState()),3),3);const id=s.ingredients.find(i=>i.name==='AJONJOLI BLANCO').id;
 s=act(s,{type:'entrada',lines:[{ingredientId:id,amount:1}]});assert.equal(s.ingredients.find(i=>i.id===id).stock,-2);const entryId=s.movements[0].id;
 s=act(s,{type:'revertir',id:entryId});assert.equal(s.ingredients.find(i=>i.id===id).stock,-3);
 s=act(s,{type:'entrada',lines:[{ingredientId:id,amount:5}]});assert.equal(s.ingredients.find(i=>i.id===id).stock,2);
 s=dispatch(request(s,4),4);s=act(s,{type:'conteo',lines:[{ingredientId:id,amount:6}]});assert.equal(s.ingredients.find(i=>i.id===id).stock,6);assert.equal(s.movements[0].lines[0].delta,8);
 assert.throws(()=>act(s,{type:'conteo',lines:[{ingredientId:id,amount:-1}]}),/cantidad válida/);
});
test('Un error de unidad en otra línea aborta el despacho completo y conserva el estado anterior',()=>{
 let s=withCatalog(emptyState());const items=s.areaItems.filter(i=>i.area==='Makis'&&['catalog-012','catalog-013'].includes(i.ingredientId));s=act(s,{type:'solicitar',area:'Makis',requester:'Equipo',lines:items.map(i=>({itemId:i.id,quantity:1,unit:'kg'}))});s.ingredients.find(i=>i.id===items[1].ingredientId).unitIssue='Recuenta en kg';
 const before=structuredClone(s);assert.throws(()=>act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:items.map(i=>({itemId:i.id,quantity:1}))}),/Revisa la unidad/);assert.deepEqual(s,before);
});

test('Despachar más de lo pedido descuenta todo, conserva la solicitud y cierra con saldo cero y cantidad adicional',()=>{
 let s=request(fixture(),3),original=structuredClone(s);s=dispatch(s,5,false,{operationId:'extra-delivery'});const r=s.requests[0],line=r.lines[0];
 assert.equal(line.quantity,3);assert.equal(line.delivered,5);assert.equal(pendingQuantity(line),0);assert.equal(additionalQuantity(line),2);assert.equal(r.closed,true);assert.equal(requestStatus(r),'Completo');assert.equal(s.ingredients.find(i=>i.id===line.ingredientId).stock,5);assert.equal(r.dispatches[0].quantities[0].quantity,5);assert.equal(s.movements[0].lines[0].delta,-5);assert.equal(original.ingredients.find(i=>i.id===line.ingredientId).stock,10);
 const retry=dispatch(s,5,false,{operationId:'extra-delivery'});assert.deepEqual(retry,s);assert.throws(()=>dispatch(s,1),/cerrado/);
});
test('Otra cantidad admite igualdad, exceso y decimales tras un parcial; Completo no genera cantidades negativas',()=>{
 let s=request(fixture(),2);s=dispatch(s,0.5);let line=s.requests[0].lines[0];assert.equal(dispatchQuantity(line,'completo'),1.5);assert.equal(dispatchQuantity(line,'parcial','1.5'),1.5);assert.equal(dispatchQuantity(line,'parcial','1.75'),1.75);
 s=dispatch(s,dispatchQuantity(line,'parcial','1.75'));line=s.requests[0].lines[0];assert.equal(line.delivered,2.25);assert.equal(additionalQuantity(line),0.25);assert.equal(pendingQuantity(line),0);assert.equal(dispatchQuantity(line,'completo'),0);assert.equal(dispatchQuantity(line,'nada'),0);assert.equal(s.ingredients.find(i=>i.id===line.ingredientId).stock,7.75);
});
test('Un pedido mixto permite adicionales en una línea y completar las otras sin volver a descontar la entregada',()=>{
 let s=fixture();const items=s.areaItems.filter(i=>i.area==='Makis'&&['catalog-012','catalog-013'].includes(i.ingredientId));s=act(s,{type:'solicitar',area:'Makis',requester:'Makis',lines:items.map((i,n)=>({itemId:i.id,quantity:n?2:3,unit:'kg'}))});
 const deliver=amounts=>act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:items.map((i,n)=>({itemId:i.id,quantity:amounts[n]}))});
 s=deliver([5,1]);assert.equal(s.requests[0].closed,false);assert.equal(pendingQuantity(s.requests[0].lines[0]),0);assert.equal(pendingQuantity(s.requests[0].lines[1]),1);
 s=deliver([1,0]);assert.equal(s.requests[0].closed,false);assert.equal(s.requests[0].lines[0].delivered,6);
 s=deliver(s.requests[0].lines.map(l=>dispatchQuantity(l,'completo')));assert.equal(s.requests[0].closed,true);assert.equal(s.ingredients.find(i=>i.id==='catalog-012').stock,4);assert.equal(s.ingredients.find(i=>i.id==='catalog-013').stock,8);assert.equal(s.requests[0].dispatches.at(-1).quantities[0].quantity,0);
});
test('Revertir una entrega adicional restaura toda su salida y conserva cerrado un pedido que todavía está cubierto',()=>{
 let s=request(fixture(),3);s=dispatch(s,1,false,{operationId:'first-small'});s=dispatch(s,4,false,{operationId:'last-extra'});
 s=act(s,{type:'revertir',id:'first-small'});assert.equal(s.requests[0].lines[0].delivered,4);assert.equal(s.requests[0].closed,true);assert.equal(s.ingredients.find(i=>i.id==='catalog-012').stock,6);
 s=act(s,{type:'revertir',id:'last-extra'});assert.equal(s.requests[0].lines[0].delivered,0);assert.equal(s.requests[0].closed,false);assert.equal(s.ingredients.find(i=>i.id==='catalog-012').stock,10);
});
test('Eliminar una orden con entrega mayor y stock negativo devuelve la cantidad real sin alterar el pedido original',()=>{
 let s=request(fixture(),3);s.ingredients.find(i=>i.id==='catalog-012').stock=0;s=dispatch(s,5);assert.equal(s.ingredients.find(i=>i.id==='catalog-012').stock,-5);
 assert.equal(orderRestocks(s,s.requests[0],convert)[0].quantity,5);s=act(s,{type:'eliminar-orden',requestId:s.requests[0].id,deletedBy:'Adrian'});assert.equal(s.ingredients.find(i=>i.id==='catalog-012').stock,0);assert.equal(s.requests[0].lines[0].quantity,3);assert.equal(s.requests[0].lines[0].delivered,5);
});
test('Una unidad incompatible aborta también un despacho mayor sin descontar parcialmente otra línea',()=>{
 let s=fixture();const items=s.areaItems.filter(i=>i.area==='Makis'&&['catalog-012','catalog-013'].includes(i.ingredientId));s=act(s,{type:'solicitar',area:'Makis',requester:'Makis',lines:items.map(i=>({itemId:i.id,quantity:1,unit:'kg'}))});s.requests[0].lines[1].unit='unidad inventada';const before=structuredClone(s);
 assert.throws(()=>act(s,{type:'despachar',requestId:s.requests[0].id,dispatcher:'Almacén',lines:items.map(i=>({itemId:i.id,quantity:5}))}),/unidad/i);assert.deepEqual(s,before);
});
