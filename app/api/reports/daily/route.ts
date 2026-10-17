import {getChatGPTUser} from '../../../chatgpt-auth';
import {workspaceFor} from '../../../../lib/workspace';
import {inventoryFor} from '../../../../lib/inventory-store';
import {buildDailyPdf} from '../../../../lib/daily-pdf';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Inicia sesión.'},{status:401});
 try{
  const scope=await workspaceFor(user);if(scope.role!=='admin')return Response.json({error:'Solo administración puede descargar el reporte.'},{status:403});
  const date=new URL(request.url).searchParams.get('date')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Selecciona una fecha válida.');
  const {state}=await inventoryFor(scope.ownerId),pdf=buildDailyPdf(state,date);
  return new Response(pdf,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="shimaya-reporte-'+date+'.pdf"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'No se pudo generar el reporte.'},{status:400})}
}
