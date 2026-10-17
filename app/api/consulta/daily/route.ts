import {sharedOwner,sharedInventory,sharedHeaders,sharedFailure,SharedAccessError,rejectSharedMutation} from '../../../../lib/shared-access';
import {buildDailyPdf} from '../../../../lib/daily-pdf';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  const ownerId=await sharedOwner(request),date=new URL(request.url).searchParams.get('date')||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw new SharedAccessError('Selecciona una fecha válida.',400);
  const {state}=await sharedInventory(ownerId);
  return new Response(buildDailyPdf(state,date),{headers:{...sharedHeaders,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="shimaya-reporte-'+date+'.pdf"'}});
 }catch(error){return sharedFailure(error)}
}
export const POST=rejectSharedMutation;
export const PUT=rejectSharedMutation;
export const PATCH=rejectSharedMutation;
export const DELETE=rejectSharedMutation;
