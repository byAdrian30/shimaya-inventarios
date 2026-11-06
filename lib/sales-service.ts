import { getPostgres } from './universal-db';
import initialSales from '../data/ventas.json';

export interface DailySaleDay {
  date: string;
  ordersCount: number;
  ventaSinIgv: number;
  igv: number;
  ventaConIgv: number;
}

const IDPOS_LOGIN = 'adrianbarranzuela0108@gmail.com';
const IDPOS_PASS = '74156527';
const STORE_UUID = '019bb992-2e78-70a8-8b69-179de1edd8fb';

let memorySalesCache: DailySaleDay[] | null = null;
let lastSyncTimestamp = 0;
let isTableInitialized = false;

function getPeruDate(offsetHours = 0): string {
  // Hora oficial de Perú (UTC-5)
  const d = new Date(Date.now() - 5 * 3600 * 1000 + offsetHours * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function ensureTableAndSeed(pg: any) {
  if (isTableInitialized) return;
  try {
    await pg.unsafe(`
      CREATE TABLE IF NOT EXISTS daily_sales (
        date VARCHAR(10) PRIMARY KEY,
        orders_count INTEGER NOT NULL DEFAULT 0,
        venta_sin_igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        venta_con_igv NUMERIC(12,2) NOT NULL DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Sembrar días iniciales si la tabla está vacía
    const countRes = await pg.unsafe('SELECT COUNT(*)::int as count FROM daily_sales;');
    const count = countRes?.[0]?.count || 0;
    if (count === 0 && initialSales.days && initialSales.days.length > 0) {
      console.log(`[sales-service] Sembrando ${initialSales.days.length} días base en PostgreSQL...`);
      for (const d of initialSales.days) {
        await pg.unsafe(
          `INSERT INTO daily_sales (date, orders_count, venta_sin_igv, igv, venta_con_igv)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (date) DO NOTHING`,
          [d.date, d.ordersCount || 0, d.ventaSinIgv || 0, d.igv || 0, d.ventaConIgv || 0]
        );
      }
    }
    isTableInitialized = true;
  } catch (err) {
    console.error('[sales-service] Error asegurando tabla daily_sales:', err);
  }
}

export async function getStoredSales(): Promise<DailySaleDay[]> {
  const pg = getPostgres();
  if (pg) {
    try {
      await ensureTableAndSeed(pg);
      const rows = await pg.unsafe(`
        SELECT 
          date, 
          orders_count as "ordersCount", 
          venta_sin_igv::float as "ventaSinIgv", 
          igv::float as "igv", 
          venta_con_igv::float as "ventaConIgv"
        FROM daily_sales 
        ORDER BY date ASC;
      `);
      if (rows && rows.length > 0) {
        memorySalesCache = rows as DailySaleDay[];
        return memorySalesCache;
      }
    } catch (err) {
      console.error('[sales-service] Error consultando PostgreSQL daily_sales:', err);
    }
  }

  if (memorySalesCache && memorySalesCache.length > 0) {
    return memorySalesCache;
  }

  return (initialSales.days || []) as DailySaleDay[];
}

export async function saveDayToDb(day: DailySaleDay): Promise<void> {
  const pg = getPostgres();
  if (pg) {
    try {
      await ensureTableAndSeed(pg);
      await pg.unsafe(
        `INSERT INTO daily_sales (date, orders_count, venta_sin_igv, igv, venta_con_igv, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (date) DO UPDATE SET
           orders_count = EXCLUDED.orders_count,
           venta_sin_igv = EXCLUDED.venta_sin_igv,
           igv = EXCLUDED.igv,
           venta_con_igv = EXCLUDED.venta_con_igv,
           updated_at = CURRENT_TIMESTAMP`,
        [day.date, day.ordersCount, day.ventaSinIgv, day.igv, day.ventaConIgv]
      );
    } catch (err) {
      console.error('[sales-service] Error guardando día en PostgreSQL:', day.date, err);
    }
  }

  // Actualizar caché en memoria
  if (!memorySalesCache) {
    memorySalesCache = [...((initialSales.days || []) as DailySaleDay[])];
  }
  const idx = memorySalesCache.findIndex(d => d.date === day.date);
  if (idx >= 0) {
    memorySalesCache[idx] = day;
  } else {
    memorySalesCache.push(day);
  }
  memorySalesCache.sort((a, b) => a.date.localeCompare(b.date));
}

async function loginIdPos(): Promise<string> {
  const res = await fetch('https://api.idbi.pe/api/v4/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pos.idbi.pe',
      'Referer': 'https://pos.idbi.pe/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    },
    body: JSON.stringify({
      login: IDPOS_LOGIN,
      password: IDPOS_PASS
    })
  });

  const json = await res.json() as any;
  const token = json?.data?.token?.value;
  if (!token) {
    throw new Error(`[ID POS] Error autenticación: ${JSON.stringify(json)}`);
  }
  return token;
}

export async function fetchIdPosDaySales(token: string, dateIso: string): Promise<DailySaleDay> {
  const [y, m, day] = dateIso.split('-').map(Number);
  const nextDt = new Date(Date.UTC(y, m - 1, day + 1));
  const nextIso = nextDt.toISOString().slice(0, 10);

  const from = `${dateIso}T05:00:00.000Z`;
  const to = `${nextIso}T04:59:59.999Z`;

  const kpisUrl = `https://api.idbi.pe/api/v6/stores/${STORE_UUID}/reports/vouchers/kpis?date[from]=${encodeURIComponent(from)}&date[to]=${encodeURIComponent(to)}`;
  const res = await fetch(kpisUrl, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://pos.idbi.pe',
      'Referer': 'https://pos.idbi.pe/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });

  const kpis = await res.json() as any;
  if (!Array.isArray(kpis)) {
    throw new Error(`[ID POS] Respuesta inválida de KPIs para ${dateIso}: ${JSON.stringify(kpis)}`);
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

  return {
    date: dateIso,
    ordersCount: totalOrders,
    ventaSinIgv,
    igv,
    ventaConIgv: totalVentaConIgv
  };
}

export async function syncIdPosSales(specificDates?: string[]): Promise<{
  syncedDays: DailySaleDay[];
  allDays: DailySaleDay[];
}> {
  console.log('[sales-service] Conectando a ID POS para sincronizar ventas...');
  const token = await loginIdPos();

  let datesToSync = specificDates;
  if (!datesToSync || datesToSync.length === 0) {
    const yesterday = getPeruDate(-24);
    const today = getPeruDate(0);

    const currentDays = await getStoredSales();
    const existingDates = new Set(currentDays.map(d => d.date));

    // Determinar qué días faltan entre el primer día de noviembre y ayer
    datesToSync = [];
    const checkStart = '2026-11-01';
    let cur = new Date(checkStart + 'T12:00:00Z');
    const end = new Date(today + 'T12:00:00Z');

    while (cur <= end) {
      const iso = cur.toISOString().slice(0, 10);
      // Sincronizar si no existe, o si es ayer o si es hoy (para mantener hoy actualizado en vivo)
      if (!existingDates.has(iso) || iso === yesterday || iso === today) {
        datesToSync.push(iso);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  const syncedDays: DailySaleDay[] = [];
  for (const d of datesToSync) {
    try {
      const daySales = await fetchIdPosDaySales(token, d);
      // Si el día de hoy aún tiene 0 ventas o no ha abierto caja, solo registrar si tiene ventas o si es fecha pasada
      if (daySales.ventaConIgv > 0 || d < getPeruDate(0)) {
        await saveDayToDb(daySales);
        syncedDays.push(daySales);
        console.log(`[sales-service] Día sincronizado ${d}: S/ ${daySales.ventaConIgv} (${daySales.ordersCount} órdenes)`);
      }
    } catch (err) {
      console.error(`[sales-service] Error sincronizando día ${d}:`, err);
    }
  }

  lastSyncTimestamp = Date.now();
  const allDays = await getStoredSales();
  return { syncedDays, allDays };
}

/**
 * On-Demand Auto-Sync:
 * Verifica si las ventas están actualizadas. Si falta el día de ayer en Perú,
 * o si han pasado más de 4 horas desde la última sincronización,
 * consulta automáticamente ID POS y actualiza PostgreSQL sin intervención manual.
 */
export async function getOrAutoSyncSales(forceSync = false): Promise<{
  days: DailySaleDay[];
  wasAutoSynced: boolean;
  lastSyncAt: string;
}> {
  let wasAutoSynced = false;
  const yesterday = getPeruDate(-24);
  const now = Date.now();

  let days = await getStoredSales();
  const hasYesterday = days.some(d => d.date === yesterday);
  const timeSinceLastSync = now - lastSyncTimestamp;

  // Sincronizar si se fuerza, o si no está el día de ayer, o si han pasado más de 4 horas
  if (forceSync || !hasYesterday || timeSinceLastSync > 4 * 3600 * 1000) {
    try {
      console.log(`[sales-service] Auto-sync activado (hasYesterday=${hasYesterday}, force=${forceSync})...`);
      const res = await syncIdPosSales();
      days = res.allDays;
      wasAutoSynced = true;
    } catch (err) {
      console.error('[sales-service] Error durante auto-sync con ID POS:', err);
    }
  }

  return {
    days,
    wasAutoSynced,
    lastSyncAt: new Date(lastSyncTimestamp || now).toISOString()
  };
}
