import { NextResponse } from 'next/server';
import { syncIdPosSales, getStoredSales } from '../../../../lib/sales-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  
  // Vercel Cron envía CRON_SECRET en el header si está configurado
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && url.searchParams.get('secret') !== cronSecret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const targetDate = url.searchParams.get('date');
    const dates = targetDate ? [targetDate] : undefined;
    
    const { syncedDays, allDays } = await syncIdPosSales(dates);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      syncedCount: syncedDays.length,
      syncedDays,
      totalDays: allDays.length,
      message: `Ventas sincronizadas exitosamente en PostgreSQL desde ID POS (${syncedDays.length} días procesados).`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error en sincronización' }, { status: 500 });
  }
}
