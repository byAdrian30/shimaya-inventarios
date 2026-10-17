import { getChatGPTUser } from '../../../chatgpt-auth';
import { workspaceFor } from '../../../../lib/workspace';
import { inventoryFor } from '../../../../lib/inventory-store';
import { inventoryValuation } from '../../../../lib/valuation';
import type { CostOverride } from '../../../../lib/valuation-types';
import { env } from 'cloudflare:workers';
import initialSales from '../../../../data/ventas.json';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const dynamic = 'force-dynamic';

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

async function costBook(ownerId: string) {
  await env.DB!.prepare('INSERT OR IGNORE INTO inventory_costs(owner_id,revision,data) VALUES(?,0,?)').bind(ownerId, JSON.stringify({ overrides: [] })).run();
  const row = await env.DB!.prepare('SELECT revision,data FROM inventory_costs WHERE owner_id=?').bind(ownerId).first<{ revision: number; data: string }>();
  if (!row) return { revision: 0, overrides: [] as CostOverride[] };
  return { revision: row.revision, overrides: JSON.parse(row.data).overrides as CostOverride[] };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });

  try {
    const scope = await workspaceFor(user);
    if (scope.role !== 'admin') {
      return Response.json({ error: 'Solo administración puede ver el rendimiento.' }, { status: 403 });
    }

    const inventory = await inventoryFor(scope.ownerId);
    const book = await costBook(scope.ownerId);
    const valuation = inventoryValuation(inventory.state, book.overrides, book.revision, inventory.revision);

    // Build ingredient cost lookup
    const costMap = new Map<string, { gross: number; net: number; name: string; unit: string; category: string }>();
    valuation.rows.forEach(r => {
      costMap.set(r.ingredientId, {
        gross: r.unitGross || 0,
        net: r.unitNet || 0,
        name: r.name,
        unit: r.unit,
        category: r.category
      });
    });

    // Extract dispatches from movements and requests
    const dailyDispatches: Record<string, {
      grossCost: number;
      netCost: number;
      totalUnits: number;
      lines: Array<{
        ingredientId: string;
        name: string;
        unit: string;
        category: string;
        quantity: number;
        unitCostGross: number;
        unitCostNet: number;
        totalCostGross: number;
        totalCostNet: number;
      }>;
    }> = {};

    (inventory.state.movements || [])
      .filter(m => m.kind === 'despacho' && !m.reversed)
      .forEach(m => {
        if (!dailyDispatches[m.date]) {
          dailyDispatches[m.date] = { grossCost: 0, netCost: 0, totalUnits: 0, lines: [] };
        }
        (m.lines || []).forEach(l => {
          const qty = Math.abs(l.delta);
          const c = costMap.get(l.ingredientId);
          const gross = (c?.gross || 0) * qty;
          const net = (c?.net || 0) * qty;

          dailyDispatches[m.date].grossCost += gross;
          dailyDispatches[m.date].netCost += net;
          dailyDispatches[m.date].totalUnits += qty;

          const existingLine = dailyDispatches[m.date].lines.find(x => x.ingredientId === l.ingredientId);
          if (existingLine) {
            existingLine.quantity += qty;
            existingLine.totalCostGross += gross;
            existingLine.totalCostNet += net;
          } else {
            dailyDispatches[m.date].lines.push({
              ingredientId: l.ingredientId,
              name: c?.name || l.name,
              unit: c?.unit || l.unit,
              category: c?.category || 'Otros',
              quantity: qty,
              unitCostGross: c?.gross || 0,
              unitCostNet: c?.net || 0,
              totalCostGross: gross,
              totalCostNet: net,
            });
          }
        });
      });

    // Sales data
    const sales = getSalesData();
    const days: any[] = sales.days || [];

    // Daily breakdown
    const dailyBreakdown = days.map(d => {
      const disp = dailyDispatches[d.date] || { grossCost: 0, netCost: 0, totalUnits: 0, lines: [] };
      const ventaSinIgv = d.ventaSinIgv || 0;
      const igv = d.igv || Math.round(ventaSinIgv * 0.18 * 100) / 100;
      const ventaConIgv = d.ventaConIgv || Math.round((ventaSinIgv + igv) * 100) / 100;
      const costoSinIgv = Math.round(disp.netCost * 100) / 100;
      const costoConIgv = Math.round(disp.grossCost * 100) / 100;

      const utilidadSinIgv = Math.round((ventaSinIgv - costoSinIgv) * 100) / 100;
      const utilidadConIgv = Math.round((ventaConIgv - costoConIgv) * 100) / 100;
      const margenPct = ventaSinIgv > 0 ? Math.round((utilidadSinIgv / ventaSinIgv) * 10000) / 100 : 0;
      const foodCostPct = ventaSinIgv > 0 ? Math.round((costoSinIgv / ventaSinIgv) * 10000) / 100 : 0;

      return {
        date: d.date,
        ordersCount: d.ordersCount || 0,
        ventaSinIgv,
        igv,
        ventaConIgv,
        costoSinIgv,
        costoConIgv,
        utilidadSinIgv,
        utilidadConIgv,
        margenPct,
        foodCostPct,
        itemsDespachados: disp.totalUnits,
        dispatchedLines: disp.lines,
      };
    });

    // 2-Day Cycles (Cada 2 días se hace pedido a almacén)
    const cycles: any[] = [];
    for (let i = 0; i < dailyBreakdown.length; i += 2) {
      const day1 = dailyBreakdown[i];
      const day2 = dailyBreakdown[i + 1];

      const periodDays = day2 ? [day1, day2] : [day1];
      const startDate = day1.date;
      const endDate = day2 ? day2.date : day1.date;
      const label = day2 
        ? `${formatDate(startDate)} - ${formatDate(endDate)}`
        : `${formatDate(startDate)} (en curso)`;

      const ventaSinIgv = Math.round(periodDays.reduce((acc, d) => acc + d.ventaSinIgv, 0) * 100) / 100;
      const igv = Math.round(periodDays.reduce((acc, d) => acc + d.igv, 0) * 100) / 100;
      const ventaConIgv = Math.round(periodDays.reduce((acc, d) => acc + d.ventaConIgv, 0) * 100) / 100;
      const costoSinIgv = Math.round(periodDays.reduce((acc, d) => acc + d.costoSinIgv, 0) * 100) / 100;
      const costoConIgv = Math.round(periodDays.reduce((acc, d) => acc + d.costoConIgv, 0) * 100) / 100;
      const ordersCount = periodDays.reduce((acc, d) => acc + d.ordersCount, 0);

      const utilidadSinIgv = Math.round((ventaSinIgv - costoSinIgv) * 100) / 100;
      const utilidadConIgv = Math.round((ventaConIgv - costoConIgv) * 100) / 100;
      const margenPct = ventaSinIgv > 0 ? Math.round((utilidadSinIgv / ventaSinIgv) * 10000) / 100 : 0;
      const foodCostPct = ventaSinIgv > 0 ? Math.round((costoSinIgv / ventaSinIgv) * 10000) / 100 : 0;
      const rentabilidadMultiplo = costoSinIgv > 0 ? Math.round((ventaSinIgv / costoSinIgv) * 100) / 100 : 0;

      // Consolidated lines
      const lineMap = new Map<string, any>();
      periodDays.forEach(d => {
        (d.dispatchedLines || []).forEach((l: any) => {
          if (!lineMap.has(l.ingredientId)) {
            lineMap.set(l.ingredientId, { ...l });
          } else {
            const cur = lineMap.get(l.ingredientId);
            cur.quantity += l.quantity;
            cur.totalCostGross += l.totalCostGross;
            cur.totalCostNet += l.totalCostNet;
          }
        });
      });

      const topInsumos = Array.from(lineMap.values())
        .sort((a, b) => b.totalCostGross - a.totalCostGross)
        .slice(0, 15);

      cycles.push({
        id: `cycle-${i / 2 + 1}`,
        cycleNumber: Math.floor(i / 2) + 1,
        label,
        startDate,
        endDate,
        ordersCount,
        ventaSinIgv,
        igv,
        ventaConIgv,
        costoSinIgv,
        costoConIgv,
        utilidadSinIgv,
        utilidadConIgv,
        margenPct,
        foodCostPct,
        rentabilidadMultiplo,
        totalItems: periodDays.reduce((acc, d) => acc + d.itemsDespachados, 0),
        topInsumos,
      });
    }

    // KPI Totals
    const totalVentaSinIgv = Math.round(dailyBreakdown.reduce((acc, d) => acc + d.ventaSinIgv, 0) * 100) / 100;
    const totalIgv = Math.round(totalVentaSinIgv * 0.18 * 100) / 100;
    const totalVentaConIgv = Math.round((totalVentaSinIgv + totalIgv) * 100) / 100;
    const totalCostoSinIgv = Math.round(dailyBreakdown.reduce((acc, d) => acc + d.costoSinIgv, 0) * 100) / 100;
    const totalCostoConIgv = Math.round(dailyBreakdown.reduce((acc, d) => acc + d.costoConIgv, 0) * 100) / 100;
    const totalUtilidadSinIgv = Math.round((totalVentaSinIgv - totalCostoSinIgv) * 100) / 100;
    const totalUtilidadConIgv = Math.round((totalVentaConIgv - totalCostoConIgv) * 100) / 100;
    const margenPromedio = totalVentaSinIgv > 0 ? Math.round((totalUtilidadSinIgv / totalVentaSinIgv) * 10000) / 100 : 0;
    const foodCostPromedio = totalVentaSinIgv > 0 ? Math.round((totalCostoSinIgv / totalVentaSinIgv) * 10000) / 100 : 0;
    const totalOrders = dailyBreakdown.reduce((acc, d) => acc + d.ordersCount, 0);

    return Response.json({
      summary: {
        totalVentaSinIgv,
        totalIgv,
        totalVentaConIgv,
        totalCostoSinIgv,
        totalCostoConIgv,
        totalUtilidadSinIgv,
        totalUtilidadConIgv,
        margenPromedio,
        foodCostPromedio,
        totalOrders,
        totalDays: dailyBreakdown.length,
        totalCycles: cycles.length,
      },
      cycles,
      daily: dailyBreakdown,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Error al calcular rendimiento.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });

  try {
    const scope = await workspaceFor(user);
    if (scope.role !== 'admin') {
      return Response.json({ error: 'Solo administración puede actualizar ventas.' }, { status: 403 });
    }

    const body = (await req.json()) as any;
    if (body.type === 'update-sales' && Array.isArray(body.days)) {
      const data = {
        generatedAt: new Date().toISOString(),
        days: body.days,
      };
      saveSalesData(data);
      return Response.json({ success: true, count: body.days.length });
    }

    return Response.json({ error: 'Acción inválida.' }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Error al guardar ventas.' }, { status: 500 });
  }
}

function formatDate(iso: string) {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const day = parts[2];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  const month = months[parseInt(parts[1], 10) - 1] || parts[1];
  return `${day} ${month}`;
}
