import { NextResponse } from 'next/server';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import initialSales from '../../../../data/ventas.json';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const tmpSalesPath = process.platform === 'win32'
  ? join(process.env.TEMP || 'C:\\Windows\\Temp', 'shimaya_ventas.json')
  : '/tmp/shimaya_ventas.json';

function getSalesData() {
  if (existsSync(tmpSalesPath)) {
    try {
      const data = JSON.parse(readFileSync(tmpSalesPath, 'utf8'));
      if (data && Array.isArray(data.days)) return data;
    } catch (_) {}
  }
  return initialSales;
}

function saveSalesData(data: any) {
  try {
    writeFileSync(tmpSalesPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (_) {}
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  
  // Vercel Cron envía CRON_SECRET en el header de autorización si está configurado
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && url.searchParams.get('secret') !== cronSecret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const targetDate = url.searchParams.get('date');
    
    // 1. Autenticar con ID POS
    const loginRes = await fetch('https://api.idbi.pe/api/v4/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://pos.idbi.pe',
        'Referer': 'https://pos.idbi.pe/',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify({
        login: 'adrianbarranzuela0108@gmail.com',
        password: 'password: 74156527'.replace('password: ', '')
      })
    });

    const loginData = await loginRes.json() as any;
    const token = loginData?.data?.token?.value;
    if (!token) {
      throw new Error('No se pudo obtener el token de autenticación de ID POS');
    }

    // 2. Determinar fecha (ayer en Perú UTC-5 por defecto)
    let dateIso = targetDate;
    if (!dateIso) {
      const nowPeru = new Date(Date.now() - 5 * 3600 * 1000);
      const yesterday = new Date(nowPeru.getTime() - 24 * 3600 * 1000);
      dateIso = yesterday.toISOString().slice(0, 10);
    }

    const [y, m, day] = dateIso.split('-').map(Number);
    const nextDt = new Date(Date.UTC(y, m - 1, day + 1));
    const nextIso = nextDt.toISOString().slice(0, 10);
    const from = `${dateIso}T05:00:00.000Z`;
    const to = `${nextIso}T04:59:59.999Z`;

    // 3. Consultar KPIs de ventas en ID POS
    const storeUuid = '019bb992-2e78-70a8-8b69-179de1edd8fb';
    const kpisUrl = `https://api.idbi.pe/api/v6/stores/${storeUuid}/reports/vouchers/kpis?date[from]=${encodeURIComponent(from)}&date[to]=${encodeURIComponent(to)}`;
    const kpisRes = await fetch(kpisUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': 'https://pos.idbi.pe',
        'Referer': 'https://pos.idbi.pe/',
        'User-Agent': 'Mozilla/5.0'
      }
    });

    const kpis = await kpisRes.json() as any;
    if (!Array.isArray(kpis)) {
      throw new Error(`Respuesta inválida de ID POS: ${JSON.stringify(kpis)}`);
    }

    let totalVentaConIgv = 0;
    let totalOrders = 0;
    for (const item of kpis) {
      if (item.type === 'NOTA DE CREDITO') {
        const amt = item.amounts?.find((a: any) => a.currency === 'PEN')?.total || 0;
        totalVentaConIgv -= amt;
      } else {
        const amt = item.amounts?.find((a: any) => a.currency === 'PEN')?.total || 0;
        totalVentaConIgv += amt;
        totalOrders += item.quantity || 0;
      }
    }

    totalVentaConIgv = Math.round(totalVentaConIgv * 100) / 100;
    const ventaSinIgv = Math.round((totalVentaConIgv / 1.18) * 100) / 100;
    const igv = Math.round((totalVentaConIgv - ventaSinIgv) * 100) / 100;

    const daySales = {
      date: dateIso,
      ordersCount: totalOrders,
      ventaSinIgv,
      igv,
      ventaConIgv: totalVentaConIgv
    };

    // 4. Actualizar ventas en memoria y /tmp
    const current = getSalesData();
    const days: any[] = [...(current.days || [])];
    const idx = days.findIndex(d => d.date === dateIso);
    if (idx >= 0) {
      days[idx] = daySales;
    } else {
      days.push(daySales);
    }
    days.sort((a, b) => a.date.localeCompare(b.date));

    const updated = {
      generatedAt: new Date().toISOString(),
      lastSyncDate: dateIso,
      totalDays: days.length,
      days
    };

    saveSalesData(updated);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      dateSynced: dateIso,
      daySales,
      totalDays: days.length,
      message: `Ventas de ${dateIso} sincronizadas automáticamente desde ID POS.`
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
