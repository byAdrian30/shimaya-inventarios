import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {dailyActivity,dispatchDetail} from './activity.ts';
import {TEAM_AREAS} from './team-access.ts';
import {requestStatus} from './requests.ts';
import type {State} from './inventory.ts';
const fmt=(n:number)=>new Intl.NumberFormat('es-PE',{maximumFractionDigits:4}).format(n);
export function buildDailyPdf(state:State,date:string){
 const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
 doc.setProperties({title:'Shimaya - Pedidos y despachos '+date,subject:'Reporte diario por áreas',author:'Shimaya Ramen'});
 const areas=[...new Set([...TEAM_AREAS,...(state.requests||[]).filter(r=>r.date===date||r.dispatches.some(d=>d.date===date)).map(r=>r.area)])];
 for(const [index,area] of areas.entries()){
  if(index)doc.addPage();
  const report=dailyActivity(state,date,area);
  const header=()=>{
   doc.setFillColor(45,73,51);doc.rect(0,0,210,21,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text('SHIMAYA RAMEN',12,13);
   doc.setTextColor(45,73,51);doc.setFontSize(16);doc.text(area.toUpperCase(),12,32);doc.setFontSize(9);doc.setFont('helvetica','normal');doc.text('Pedidos y despachos del '+date.split('-').reverse().join('/'),12,39);
  };
  header();doc.setTextColor(60,70,57);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text('PEDIDOS DEL DIA',12,48);
  const settings={theme:'grid' as const,styles:{font:'helvetica',fontSize:8,cellPadding:2.1,textColor:[48,58,43] as [number,number,number],lineColor:[218,225,211] as [number,number,number],lineWidth:0.15,overflow:'linebreak' as const},headStyles:{fillColor:[70,94,58] as [number,number,number],textColor:[255,255,255] as [number,number,number],fontStyle:'bold' as const},alternateRowStyles:{fillColor:[247,249,243] as [number,number,number]},margin:{top:47,bottom:24,left:12,right:12},rowPageBreak:'avoid' as const,didDrawPage:header};
  let after=71;
  if(report.ordered.length){
   autoTable(doc,{...settings,startY:52,head:[['Pedido','Insumo','Cantidad','Unidad','Solicitante / estado']],body:report.ordered.flatMap(r=>r.lines.map(l=>[r.number,l.name+(l.presentationSelected?'\n'+l.ingredientName:''),fmt(l.quantity),l.unit,r.requester+'\n'+requestStatus(r)])),columnStyles:{0:{cellWidth:23},1:{cellWidth:73},2:{cellWidth:19,halign:'right'},3:{cellWidth:27},4:{cellWidth:44}}});
   after=(doc as jsPDF&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+12;
  }else {doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('No se registraron pedidos en esta fecha.',12,57);}
  if(after>250){doc.addPage();header();after=48;}
  doc.setFont('helvetica','bold');doc.setFontSize(10);doc.setTextColor(60,70,57);doc.text('DESPACHOS DEL DIA',12,after);
  if(report.dispatched.length){
   autoTable(doc,{...settings,startY:after+4,head:[['Pedido / fecha','Insumo','Entregado','Unidad','Responsable / registro']],body:report.dispatched.flatMap(({request,dispatch})=>{
    const entries=dispatchDetail(request,dispatch),status=dispatch.reversed?'ANULADO':'Confirmado';
    return entries.length?entries.map(({line,quantity})=>[request.number+'\n'+request.date,line!.name+(line!.presentationSelected?'\n'+line!.ingredientName:''),fmt(quantity),line!.unit,dispatch.dispatcher+'\n'+status]):[[request.number+'\n'+request.date,'Cierre sin entrega','0','-',dispatch.dispatcher+'\n'+status]];
   }),columnStyles:{0:{cellWidth:27},1:{cellWidth:69},2:{cellWidth:19,halign:'right'},3:{cellWidth:27},4:{cellWidth:44}}});
  }else {doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('No se registraron despachos en esta fecha.',12,after+9);}
 }
 const count=doc.getNumberOfPages();for(let page=1;page<=count;page++){doc.setPage(page);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110,121,100);doc.text('Estado de las órdenes al descargar. Anulados conservados para consulta.',12,282);doc.text(page+' / '+count,198,288,{align:'right'});doc.text('SHIMAYA - CONTROL DE INVENTARIOS',12,288);}
 return new Uint8Array(doc.output('arraybuffer'));
}
