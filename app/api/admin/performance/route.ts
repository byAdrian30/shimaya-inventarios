import { getChatGPTUser } from '../../../chatgpt-auth';
import { workspaceFor } from '../../../../lib/workspace';
import { inventoryFor } from '../../../../lib/inventory-store';
import { inventoryValuation } from '../../../../lib/valuation';
import type { CostOverride } from '../../../../lib/valuation-types';
import { env } from 'cloudflare:workers';
import { getOrAutoSyncSales, saveDayToDb } from '../../../../lib/sales-service';

export const dynamic = 'force-dynamic';

async function costBook(ownerId: string) {
  await env.DB!.prepare('INSERT OR IGNORE INTO inventory_costs(owner_id,revision,data) VALUES(?,0,?)').bind(ownerId, JSON.stringify({ overrides: [] })).run();
  const row = await env.DB!.prepare('SELECT revision,data FROM inventory_costs WHERE owner_id=?').bind(ownerId).first<{ revision: number; data: string }>();
  if (!row) return { revision: 0, overrides: [] as CostOverride[] };
  return { revision: row.revision, overrides: JSON.parse(row.data).overrides as CostOverride[] };
}

export async function GET(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });

  try {
    const scope = await workspaceFor(user);
    if (scope.role !== 'admin' && scope.role !== 'viewer') {
      return Response.json({ error: 'Solo administración y socios pueden ver el rendimiento.' }, { status: 403 });
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

    const url = new URL(req.url);
    const forceSync = url.searchParams.get('sync') === 'true';

    // Sales data con On-Demand Auto-Sync autónomo desde ID POS y PostgreSQL
    const salesResult = await getOrAutoSyncSales(forceSync);
    const allDays: any[] = (salesResult.days || []).slice().sort((a: any, b: any) => a.date.localeCompare(b.date));

    const monthNames: Record<string, string> = {
      '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
      '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
      '09': 'Setiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre'
    };

    // Identificar todos los meses presentes en ventas y despachos
    const monthSet = new Set<string>();
    allDays.forEach(d => { if (d.date && d.date.length >= 7) monthSet.add(d.date.slice(0, 7)); });
    Object.keys(dailyDispatches).forEach(date => { if (date.length >= 7) monthSet.add(date.slice(0, 7)); });

    const monthList = Array.from(monthSet).sort().reverse(); // ['2026-11', '2026-10']

    // Helper para construir el cálculo de rentabilidad para un período específico
    function buildPeriodData(
      periodDays: any[],
      meta: { id: string; label: string; range: string; description: string }
    ) {
      const sortedDays = [...periodDays].sort((a, b) => a.date.localeCompare(b.date));
      const cycles: any[] = [];
      const dailyWithAverages: any[] = [];

      for (let i = 0; i < sortedDays.length; i += 2) {
        const day1 = sortedDays[i];
        const day2 = sortedDays[i + 1];
        const isSingleDayIncomplete = !day2;
        const cycleDays = day2 ? [day1, day2] : [day1];

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

        // PROMEDIO DIARIO: Dado que el pedido abastece 2 días, cada día recibe el 50% del costo.
        // Si el ciclo solo tiene 1 día transcurrido (en curso), se le imputa el 50% de consumo estimado de ese día.
        const dailyPromedioNetCost = Math.round((cycleNetCost / 2) * 100) / 100;
        const dailyPromedioGrossCost = Math.round((cycleGrossCost / 2) * 100) / 100;
        const dailyPromedioUnits = Math.round((cycleTotalUnits / 2) * 10) / 10;

        const cycleId = `${meta.id}-cycle-${Math.floor(i / 2) + 1}`;
        const cycleLabel = day2
          ? `${formatDate(day1.date)} - ${formatDate(day2.date)}`
          : `${formatDate(day1.date)} (en curso)`;

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
            costoSinIgv: dCostoSinIgv,
            costoConIgv: dCostoConIgv,
            utilidadSinIgv: dUtilidadSinIgv,
            utilidadConIgv: dUtilidadConIgv,
            margenPct: dMargenPct,
            foodCostPct: dFoodCostPct,
            itemsDespachados: dailyPromedioUnits,
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

      const totalVentaSinIgv = Math.round(dailyWithAverages.reduce((acc, d) => acc + d.ventaSinIgv, 0) * 100) / 100;
      const totalIgv = Math.round(totalVentaSinIgv * 0.18 * 100) / 100;
      const totalVentaConIgv = Math.round((totalVentaSinIgv + totalIgv) * 100) / 100;

      const totalCostoSinIgv = Math.round(dailyWithAverages.reduce((acc, d) => acc + d.costoSinIgv, 0) * 100) / 100;
      const totalCostoConIgv = Math.round(dailyWithAverages.reduce((acc, d) => acc + d.costoConIgv, 0) * 100) / 100;

      const totalCostoDespachadoSinIgv = Math.round(cycles.reduce((acc, c) => acc + c.costoSinIgv, 0) * 100) / 100;
      const totalCostoDespachadoConIgv = Math.round(cycles.reduce((acc, c) => acc + c.costoConIgv, 0) * 100) / 100;

      const totalUtilidadSinIgv = Math.round((totalVentaSinIgv - totalCostoSinIgv) * 100) / 100;
      const totalUtilidadConIgv = Math.round((totalVentaConIgv - totalCostoConIgv) * 100) / 100;

      const margenPromedio = totalVentaSinIgv > 0 ? Math.round((totalUtilidadSinIgv / totalVentaSinIgv) * 10000) / 100 : 0;
      const foodCostPromedio = totalVentaSinIgv > 0 ? Math.round((totalCostoSinIgv / totalVentaSinIgv) * 10000) / 100 : 0;
      const totalOrders = dailyWithAverages.reduce((acc, d) => acc + d.ordersCount, 0);

      return {
        summary: {
          totalVentaSinIgv,
          totalIgv,
          totalVentaConIgv,
          totalCostoSinIgv,
          totalCostoConIgv,
          totalCostoDespachadoSinIgv,
          totalCostoDespachadoConIgv,
          totalUtilidadSinIgv,
          totalUtilidadConIgv,
          margenPromedio,
          foodCostPromedio,
          totalOrders,
          totalDays: dailyWithAverages.length,
          totalCycles: cycles.length,
          periodId: meta.id,
          periodName: meta.label,
          periodRange: meta.range,
          periodDescription: meta.description,
        },
        cycles,
        daily: dailyWithAverages,
      };
    }

    // Construir los períodos disponibles por mes natural
    const periods: Record<string, any> = {};
    const availableMonths: Array<{
      id: string;
      label: string;
      shortLabel: string;
      range: string;
      isCurrent: boolean;
      daysCount: number;
    }> = [];

    monthList.forEach(m => {
      const [year, mo] = m.split('-');
      const monthLabel = `${monthNames[mo] || mo} ${year}`;
      const mDays = allDays.filter(d => d.date.startsWith(m)).sort((a, b) => a.date.localeCompare(b.date));
      const firstDay = mDays[0]?.date || `${m}-01`;
      const lastDay = mDays[mDays.length - 1]?.date || `${m}-31`;
      const isCurrentMonth = m === '2026-11' || m === monthList[0];

      // Formato de rango: 01/11 al 30/11 o fecha de corte
      const rangeText = `${formatDate(firstDay)} al ${formatDate(lastDay)}${isCurrentMonth ? ' (en curso)' : ''}`;

      periods[m] = buildPeriodData(mDays, {
        id: m,
        label: monthLabel,
        range: rangeText,
        description: `Período mensual de ${monthLabel}: calculado desde el ${formatDate(firstDay)} hasta el ${formatDate(lastDay)}. Insumos de cada pedido de 2 días promediados al 50% diario.`,
      });

      availableMonths.push({
        id: m,
        label: monthLabel,
        shortLabel: `${monthNames[mo]?.slice(0, 3) || mo} ${year}`,
        range: rangeText,
        isCurrent: isCurrentMonth,
        daysCount: mDays.length,
      });
    });

    // Agregar período consolidado histórico
    const allRangeText = allDays.length > 0
      ? `${formatDate(allDays[0].date)} al ${formatDate(allDays[allDays.length - 1].date)} (Acumulado)`
      : 'Histórico';

    // Para el histórico global, concatenamos los ciclos de cada mes para no cruzar días entre meses
    const allCycles: any[] = [];
    const allDaily: any[] = [];
    monthList.slice().reverse().forEach(m => {
      const p = periods[m];
      if (p) {
        allCycles.push(...p.cycles);
        allDaily.push(...p.daily);
      }
    });

    const histVentaSinIgv = Math.round(allDaily.reduce((acc, d) => acc + d.ventaSinIgv, 0) * 100) / 100;
    const histIgv = Math.round(histVentaSinIgv * 0.18 * 100) / 100;
    const histVentaConIgv = Math.round((histVentaSinIgv + histIgv) * 100) / 100;
    const histCostoSinIgv = Math.round(allDaily.reduce((acc, d) => acc + d.costoSinIgv, 0) * 100) / 100;
    const histCostoConIgv = Math.round(allDaily.reduce((acc, d) => acc + d.costoConIgv, 0) * 100) / 100;
    const histCostoDespachadoSinIgv = Math.round(allCycles.reduce((acc, c) => acc + c.costoSinIgv, 0) * 100) / 100;
    const histCostoDespachadoConIgv = Math.round(allCycles.reduce((acc, c) => acc + c.costoConIgv, 0) * 100) / 100;
    const histUtilidadSinIgv = Math.round((histVentaSinIgv - histCostoSinIgv) * 100) / 100;
    const histUtilidadConIgv = Math.round((histVentaConIgv - histCostoConIgv) * 100) / 100;
    const histMargen = histVentaSinIgv > 0 ? Math.round((histUtilidadSinIgv / histVentaSinIgv) * 10000) / 100 : 0;
    const histFoodCost = histVentaSinIgv > 0 ? Math.round((histCostoSinIgv / histVentaSinIgv) * 10000) / 100 : 0;

    periods['all'] = {
      summary: {
        totalVentaSinIgv: histVentaSinIgv,
        totalIgv: histIgv,
        totalVentaConIgv: histVentaConIgv,
        totalCostoSinIgv: histCostoSinIgv,
        totalCostoConIgv: histCostoConIgv,
        totalCostoDespachadoSinIgv: histCostoDespachadoSinIgv,
        totalCostoDespachadoConIgv: histCostoDespachadoConIgv,
        totalUtilidadSinIgv: histUtilidadSinIgv,
        totalUtilidadConIgv: histUtilidadConIgv,
        margenPromedio: histMargen,
        foodCostPromedio: histFoodCost,
        totalOrders: allDaily.reduce((acc, d) => acc + d.ordersCount, 0),
        totalDays: allDaily.length,
        totalCycles: allCycles.length,
        periodId: 'all',
        periodName: 'Todo el Histórico',
        periodRange: allRangeText,
        periodDescription: `Consolidado acumulado completo (${allRangeText}). Insumos promediados al 50% por ciclo de 2 días respetando las fronteras de cada mes.`,
      },
      cycles: allCycles,
      daily: allDaily,
    };

    availableMonths.push({
      id: 'all',
      label: 'Todo el Histórico',
      shortLabel: 'Histórico',
      range: allRangeText,
      isCurrent: false,
      daysCount: allDaily.length,
    });

    // Determinar el mes activo solicitado (por query param o por defecto el mes en curso)
    let selectedMonth = '2026-11';
    try {
      const url = new URL(req.url);
      const reqMonth = url.searchParams.get('month');
      if (reqMonth && periods[reqMonth]) {
        selectedMonth = reqMonth;
      } else if (!periods[selectedMonth]) {
        selectedMonth = monthList[0] || 'all';
      }
    } catch (_) {
      if (!periods[selectedMonth]) selectedMonth = monthList[0] || 'all';
    }

    const activePeriod = periods[selectedMonth] || periods['all'];

    return Response.json({
      selectedMonth,
      availableMonths,
      periods,
      summary: activePeriod.summary,
      cycles: activePeriod.cycles,
      daily: activePeriod.daily,
      lastSyncAt: salesResult.lastSyncAt,
      wasAutoSynced: salesResult.wasAutoSynced,
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
      for (const d of body.days) {
        await saveDayToDb(d);
      }
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
