import type {State,Movement} from './inventory.ts';
import type {Requisition} from './requests.ts';

export function dailyActivity(state:State,date:string,area=''){
 const requests=(state.requests||[]).filter(r=>!area||r.area===area);
 const ordered=requests.filter(r=>r.date===date).sort((a,b)=>b.at.localeCompare(a.at));
 const dispatched=requests.flatMap(request=>request.dispatches.filter(d=>d.date===date).map(dispatch=>({request,dispatch}))).sort((a,b)=>b.dispatch.at.localeCompare(a.dispatch.at));
 return {ordered,dispatched,activeOrders:ordered.filter(r=>!r.deleted).length,activeDispatches:dispatched.filter(({dispatch})=>!dispatch.reversed).length};
}
export function recentDeductions(state:State,limit=10){
 return state.movements.filter(m=>!m.reversed).slice().sort((a,b)=>b.at.localeCompare(a.at)).flatMap(m=>m.lines.filter(l=>l.delta<0).map((line,index)=>({id:m.id+':'+index,movement:m,line}))).slice(0,limit);
}
export function deductionReason(movement:Movement){
 return ({despacho:'Despacho',merma:'Merma',conteo:'Ajuste por conteo',importar:'Inventario importado',pedido:'Salida',apertura:'Ajuste de stock'} as Record<string,string>)[movement.kind]||'Ajuste de stock';
}
export function dispatchDetail(request:Requisition,dispatch:Requisition['dispatches'][number]){
 return dispatch.quantities.map(q=>({quantity:q.quantity,line:request.lines.find(l=>l.itemId===q.itemId)})).filter(entry=>entry.quantity>0&&entry.line);
}
