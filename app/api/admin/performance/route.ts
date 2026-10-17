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
    const allDays: any[] = sales.days || [];

    // Determinar la fecha de inicio de los despachos de almacén
    const dispatchDates = Object.keys(dailyDispatches).filter(d => dailyDispatches[d].totalUnits > 0).sort();
    
    // Los pedidos a almacén se hacen cada 2 días para abastecer el ciclo de 2 días.
    // El primer despacho registrado (12 de Octubre) abasteció el ciclo del 11 y 12 de Octubre.
    // Por lo tanto, el ciclo operativo con despachos inicia el 11 de Octubre de 2026.
    let dispatchStartDate = '2026-10-11';
    if (dispatchDates.length > 0 && dispatchDates[0] < dispatchStartDate) {
      dispatchStartDate = dispatchDates[0];
    }

    // Filtrar solo los días desde que se empezaron a hacer despachos
    const activeDays = allDays.filter(d => d.date >= dispatchStartDate).sort((a, b) => a.date.localeCompare(b.date));
    const priorDays = allDays.filter(d => d.date < dispatchStartDate).sort((a, b) => a.date.localeCompare(b.date));

    // Construcción de Ciclos de 2 días con Promedio Diario para ambos días
    const cycles: any[] = [];
    const dailyWithAverages: any[] = [];

    for (let i = 0; i < activeDays.length; i += 2) {
      const day1 = activeDays[i];
      const day2 = activeDays[i + 1];
      const isSingleDayIncomplete = !day2;
      const cycleDays = day2 ? [day1, day2] : [day1];

      // Costo total de pedidos de almacén asociados a este ciclo de 2 días
      const cycleDispatches = cycleDays.map(d => dailyDispatches[d.date] || { grossCost: 0, netCost: 0, totalUnits: 0, lines: [] });
      const cycleGrossCost = Math.round(cycleDispatches.reduce((acc, cd) => acc + cd.grossCost, 0) * 100) / 100;
      const cycleNetCost = Math.round(cycleDispatches.reduce((acc, cd) => acc + cd.netCost, 0) * 100) / 100;
      const cycleTotalUnits = cycleDispatches.reduce((acc, cd) => acc + cd.totalUnits, 0);

      // Consolidar insumos despachados en este ciclo
      const lineMap = new Map<string, any>();
      cycleDispatches.forEach(cd => {
        cd.lines.forEach((l: any) => {
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
      const topInsumos = Array.from(lineMap.values()).sort((a, b) => b.totalCostGross - a.totalCostGross);

      // Ventas acumuladas del ciclo
      const cycleVentaSinIgv = Math.round(cycleDays.reduce((acc, d) => acc + (d.ventaSinIgv || 0), 0) * 100) / 100;
      const cycleIgv = Math.round(cycleDays.reduce((acc, d) => acc + (d.igv || Math.round((d.ventaSinIgv || 0) * 0.18 * 100) / 100), 0) * 100) / 100;
      const cycleVentaConIgv = Math.round(cycleDays.reduce((acc, d) => acc + (d.ventaConIgv || Math.round(((d.ventaSinIgv || 0) + (d.igv || 0)) * 100) / 100), 0) * 100) / 100;
      const cycleOrdersCount = cycleDays.reduce((acc, d) => acc + (d.ordersCount || 0), 0);

      // Rentabilidad del ciclo global (los 2 días juntos)
      const cycleUtilidadSinIgv = Math.round((cycleVentaSinIgv - cycleNetCost) * 100) / 100;
      const cycleUtilidadConIgv = Math.round((cycleVentaConIgv - cycleGrossCost) * 100) / 100;
      const cycleMargenPct = cycleVentaSinIgv > 0 ? Math.round((cycleUtilidadSinIgv / cycleVentaSinIgv) * 10000) / 100 : 0;
      const cycleFoodCostPct = cycleVentaSinIgv > 0 ? Math.round((cycleNetCost / cycleVentaSinIgv) * 10000) / 100 : 0;
      const cycleMultiplo = cycleNetCost > 0 ? Math.round((cycleVentaSinIgv / cycleNetCost) * 100) / 100 : 0;

      // PROMEDIO DIARIO: Dado que el pedido abastece 2 días, cada día recibe el 50% del costo del pedido.
      // Si el ciclo solo tiene 1 día transcurrido (en curso), se le imputa el 50% de consumo estimado de ese día.
      const dailyPromedioNetCost = Math.round((cycleNetCost / 2) * 100) / 100;
      const dailyPromedioGrossCost = Math.round((cycleGrossCost / 2) * 100) / 100;
      const dailyPromedioUnits = Math.round((cycleTotalUnits / 2) * 10) / 10;

      const cycleId = `cycle-${Math.floor(i / 2) + 1}`;
      const cycleLabel = day2
        ? `${formatDate(day1.date)} - ${formatDate(day2.date)}`
        : `${formatDate(day1.date)} (en curso)`;

      // Procesar cada día asignándole el costo y rentabilidad promediada de ambos días
      cycleDays.forEach((d, idx) => {
        const dVentaSinIgv = d.ventaSinIgv || 0;
        const dIgv = d.igv || Math.round(dVentaSinIgv * 0.18 * 100) / 100;
        const dVentaConIgv = d.ventaConIgv || Math.round((dVentaSinIgv + dIgv) * 100) / 100;

        const dCostoSinIgv = dailyPromedioNetCost;
        const dCostoConIgv = dailyPromedioGrossCost;

        const dUtilidadSinIgv = Math.round((dVentaSinIgv - dCostoSinIgv) * 100) / 100;
        const dUtilidadConIgv = Math.round((dVentaConIgv - dCostoConIgv) * 100) / 100;
        const dMargenPct = dVentaSinIgv > 0 ? Math.round((dUtilidadSinIgv / dVentaSinIgv) * 10000) / 100 : 0;
        const dFoodCostPct = dVentaSinIgv > 0 ? Math.round((dCostoSinIgv / dVentaSinIgv) * 10000) / 100 : 0;

        const physicalDisp = dailyDispatches[d.date] || { grossCost: 0, netCost: 0, totalUnits: 0, lines: [] };

        dailyWithAverages.push({
          date: d.date,
          ordersCount: d.ordersCount || 0,
          ventaSinIgv: dVentaSinIgv,
          igv: dIgv,
          ventaConIgv: dVentaConIgv,
          costoSinIgv: dCostoSinIgv, // Costo promedio imputado al día
          costoConIgv: dCostoConIgv,
          utilidadSinIgv: dUtilidadSinIgv,
          utilidadConIgv: dUtilidadConIgv,
          margenPct: dMargenPct,
          foodCostPct: dFoodCostPct,
          itemsDespachados: dailyPromedioUnits,
          // Datos del ciclo y física del pedido
          cycleId,
          cycleLabel,
          dayInCycle: idx + 1,
          cycleMargenPromedio: cycleMargenPct,
          cycleFoodCostPromedio: cycleFoodCostPct,
          pedidoFisicoMontoNeto: Math.round(physicalDisp.netCost * 100) / 100,
          pedidoFisicoLlegado: physicalDisp.netCost > 0,
          dispatchedLines: physicalDisp.lines,
        });
      });

      cycles.push({
        id: cycleId,
        cycleNumber: Math.floor(i / 2) + 1,
        label: cycleLabel,
        startDate: day1.date,
        endDate: day2 ? day2.date : day1.date,
        isEnCurso: isSingleDayIncomplete,
        ordersCount: cycleOrdersCount,
        ventaSinIgv: cycleVentaSinIgv,
        igv: cycleIgv,
        ventaConIgv: cycleVentaConIgv,
        costoSinIgv: cycleNetCost,
        costoConIgv: cycleGrossCost,
        costoPromedioPorDia: dailyPromedioNetCost,
        utilidadSinIgv: cycleUtilidadSinIgv,
        utilidadConIgv: cycleUtilidadConIgv,
        margenPct: cycleMargenPct,
        foodCostPct: cycleFoodCostPct,
        rentabilidadMultiplo: cycleMultiplo,
        totalItems: cycleTotalUnits,
        topInsumos: topInsumos.slice(0, 20),
        days: cycleDays.map(d => d.date),
      });
    }

    // Totales calculados estrictamente desde el inicio de despachos
    const totalVentaSinIgv = Math.round(dailyWithAverages.reduce((acc, d) => acc + d.ventaSinIgv, 0) * 100) / 100;
    const totalIgv = Math.round(totalVentaSinIgv * 0.18 * 100) / 100;
    const totalVentaConIgv = Math.round((totalVentaSinIgv + totalIgv) * 100) / 100;

    // Costo de insumos consumidos imputados a los días transcurridos
    const totalCostoInsumosConsumidosSinIgv = Math.round(dailyWithAverages.reduce((acc, d) => acc + d.costoSinIgv, 0) * 100) / 100;
    const totalCostoInsumosConsumidosConIgv = Math.round(dailyWithAverages.reduce((acc, d) => acc + d.costoConIgv, 0) * 100) / 100;

    // Costo de insumos totales traídos de almacén
    const totalCostoDespachadoSinIgv = Math.round(cycles.reduce((acc, c) => acc + c.costoSinIgv, 0) * 100) / 100;
    const totalCostoDespachadoConIgv = Math.round(cycles.reduce((acc, c) => acc + c.costoConIgv, 0) * 100) / 100;

    const totalUtilidadSinIgv = Math.round((totalVentaSinIgv - totalCostoInsumosConsumidosSinIgv) * 100) / 100;
    const totalUtilidadConIgv = Math.round((totalVentaConIgv - totalCostoInsumosConsumidosConIgv) * 100) / 100;

    const margenPromedio = totalVentaSinIgv > 0 ? Math.round((totalUtilidadSinIgv / totalVentaSinIgv) * 10000) / 100 : 0;
    const foodCostPromedio = totalVentaSinIgv > 0 ? Math.round((totalCostoInsumosConsumidosSinIgv / totalVentaSinIgv) * 10000) / 100 : 0;
    const totalOrders = dailyWithAverages.reduce((acc, d) => acc + d.ordersCount, 0);

    return Response.json({
      summary: {
        totalVentaSinIgv,
        totalIgv,
        totalVentaConIgv,
        totalCostoSinIgv: totalCostoInsumosConsumidosSinIgv,
        totalCostoConIgv: totalCostoInsumosConsumidosConIgv,
        totalCostoDespachadoSinIgv,
        totalCostoDespachadoConIgv,
        totalUtilidadSinIgv,
        totalUtilidadConIgv,
        margenPromedio,
        foodCostPromedio,
        totalOrders,
        totalDays: dailyWithAverages.length,
        totalCycles: cycles.length,
        dispatchStartDate,
        periodDescription: `Calculado desde el ${formatDate(dispatchStartDate)} (inicio de despachos de almacén). Insumos de pedidos de 2 días promediados al 50% diario.`,
      },
      cycles,
      daily: dailyWithAverages,
      priorDaysCount: priorDays.length,
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
