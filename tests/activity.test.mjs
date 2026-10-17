import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,withCatalog,applyAction} from '../lib/inventory.ts';
import {dailyActivity,recentDeductions,dispatchDetail} from '../lib/activity.ts';

function fixture(){
 let state=withCatalog(emptyState());
 const item=state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId==='catalog-012');
 state=applyAction(state,{type:'solicitar',date:'2026-10-10',area:item.area,requester:'Makis',operationId:'request-day-before',lines:[{itemId:item.id,quantity:3,unit:'kg'}]});
 const requestId=state.requests[0].id;
 state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId,dispatcher:'Almacén',operationId:'first-delivery',lines:[{itemId:item.id,quantity:1}]});
 state=applyAction(state,{type:'despachar',date:'2026-10-12',requestId,dispatcher:'Almacén',operationId:'second-delivery',lines:[{itemId:item.id,quantity:2}]});
 return {state,item,requestId};
}
test('La consulta usa la fecha de cada entrega y no la fecha del pedido ni el acumulado entregado',()=>{
 const {state}=fixture();
 assert.equal(dailyActivity(state,'2026-10-10').ordered.length,1);
 assert.equal(dailyActivity(state,'2026-10-10').dispatched.length,0);
 const report=dailyActivity(state,'2026-10-11');assert.equal(report.ordered.length,0);assert.equal(report.dispatched.length,1);assert.equal(report.activeDispatches,1);
 assert.equal(dispatchDetail(report.dispatched[0].request,report.dispatched[0].dispatch)[0].quantity,1);
 const next=dailyActivity(state,'2026-10-12').dispatched[0];assert.equal(dispatchDetail(next.request,next.dispatch)[0].quantity,2);
 assert.equal(dailyActivity(state,'2026-10-11','Barra').dispatched.length,0);
 assert.equal(dailyActivity(state,'2026-10-11','Makis').dispatched.length,1);
});
test('La consulta conserva las órdenes eliminadas y entregas anuladas, pero excluye sus descuentos vigentes',()=>{
 let {state,requestId}=fixture();
 state=applyAction(state,{type:'eliminar-orden',date:'2026-10-13',requestId,deletedBy:'Admin',operationId:'delete-order'});
 const orders=dailyActivity(state,'2026-10-10');assert.equal(orders.ordered.length,1);assert.equal(orders.activeOrders,0);assert.ok(orders.ordered[0].deleted);
 const dispatches=dailyActivity(state,'2026-10-11');assert.equal(dispatches.dispatched.length,1);assert.equal(dispatches.activeDispatches,0);assert.equal(dispatches.dispatched[0].dispatch.reversed,true);
 assert.deepEqual(recentDeductions(state),[]);
});
test('Los descuentos recientes salen del stock descontado, con su unidad y saldo, nunca del pedido sin entregar',()=>{
 const {state}=fixture();
 for(const m of state.movements)m.at=m.id==='first-delivery'?'2026-10-11T10:00:00Z':m.id==='second-delivery'?'2026-10-12T10:00:00Z':'2026-10-10T10:00:00Z';
 const results=recentDeductions(state);assert.equal(results.length,2);assert.equal(results[0].movement.id,'second-delivery');assert.equal(results[0].line.delta,-2);assert.equal(results[0].line.after,-3);assert.equal(results[0].line.unit,'kg');
 assert.equal(recentDeductions(state,1).length,1);assert.ok(results.every(r=>r.movement.kind==='despacho'));
 assert.deepEqual(recentDeductions({...state,movements:state.movements.filter(m=>m.kind==='solicitud')}),[]);
});
test('Un cierre sin entrega aparece como despacho de cero y no genera descuento',()=>{
 let state=withCatalog(emptyState());const item=state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId==='catalog-012');
 state=applyAction(state,{type:'solicitar',date:'2026-10-11',area:item.area,requester:'Makis',lines:[{itemId:item.id,quantity:2,unit:'kg'}]});
 state=applyAction(state,{type:'despachar',date:'2026-10-12',requestId:state.requests[0].id,dispatcher:'Almacén',close:true,lines:[{itemId:item.id,quantity:0}]});
 const {request,dispatch}=dailyActivity(state,'2026-10-12').dispatched[0];assert.deepEqual(dispatchDetail(request,dispatch),[]);assert.deepEqual(recentDeductions(state),[]);
});

test('La consulta por fecha conserva lo pedido y muestra el despacho adicional completo en su fecha',()=>{
 let state=withCatalog(emptyState());const item=state.areaItems.find(i=>i.area==='Makis'&&i.ingredientId==='catalog-012');state=applyAction(state,{type:'solicitar',date:'2026-10-10',area:'Makis',requester:'Equipo',lines:[{itemId:item.id,quantity:3,unit:'kg'}]});state=applyAction(state,{type:'despachar',date:'2026-10-11',requestId:state.requests[0].id,dispatcher:'Almacén',lines:[{itemId:item.id,quantity:5}]});
 assert.equal(dailyActivity(state,'2026-10-10').ordered[0].lines[0].quantity,3);const delivery=dailyActivity(state,'2026-10-11').dispatched[0];assert.equal(dispatchDetail(delivery.request,delivery.dispatch)[0].quantity,5);assert.equal(recentDeductions(state)[0].line.delta,-5);
});
