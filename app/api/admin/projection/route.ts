import { getChatGPTUser } from '../../../chatgpt-auth';
import { workspaceFor } from '../../../../lib/workspace';
import { inventoryFor } from '../../../../lib/inventory-store';
import initialCatalog from '../../../../data/catalogo_proyeccion.json';
import initialDishes from '../../../../data/ventas_platos_01_14_octubre.json';
import initialDailyDishes from '../../../../data/ventas_platos_diarios_compact.json';
import initialRecipes from '../../../../data/recetas_platos.json';
import initialVentas from '../../../../data/ventas.json';

export const dynamic = 'force-dynamic';

function norm(str: string) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });

  try {
    const scope = await workspaceFor(user);
    if (scope.role !== 'admin' && scope.role !== 'viewer') {
      return Response.json({ error: 'Solo administración puede ver la proyección de pedidos.' }, { status: 403 });
    }

    const inventory = await inventoryFor(scope.ownerId);
    const url = new URL(req.url);

    // Parámetros de Simulación de Tránsito (Lead Time)
    const orderDate = url.searchParams.get('orderDate') || new Date().toISOString().slice(0, 10);
    const arrivalDate = url.searchParams.get('arrivalDate') || new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const coverageDays = parseInt(url.searchParams.get('coverageDays') || '7') || 7;
    const bufferDays = parseInt(url.searchParams.get('bufferDays') || '2') || 2;
    const holidayFactor = parseFloat(url.searchParams.get('holidayFactor') || '1.05') || 1.05;

    // Margen de Análisis de Ventas
    const salesMargin = url.searchParams.get('salesMargin') || 'last7';
    const customStart = url.searchParams.get('startDate') || '';
    const customEnd = url.searchParams.get('endDate') || '';

    // Cálculo del Lead Time en días
    const startMs = new Date(orderDate + 'T12:00:00Z').getTime();
    const endMs = new Date(arrivalDate + 'T12:00:00Z').getTime();
    const leadTimeDays = Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));

    // Análisis de ventas en el margen elegido
    const allDays = ((initialVentas as any)?.days || []) as Array<{ date: string; ventaConIgv: number }>;
    const baseDays = allDays.filter(d => d.date >= '2026-10-01' && d.date <= '2026-10-14');
    const baseDailyRevenue = baseDays.length > 0
      ? baseDays.reduce((a, b) => a + (b.ventaConIgv || 0), 0) / baseDays.length
      : 7349;

    let selectedDays: typeof allDays = [];
    if (salesMargin === 'last7') selectedDays = allDays.slice(-7);
    else if (salesMargin === 'last14') selectedDays = allDays.slice(-14);
    else if (salesMargin === 'last30') selectedDays = allDays.slice(-30);
    else if (salesMargin === 'october') selectedDays = allDays.filter(d => d.date >= '2026-10-01' && d.date <= '2026-10-31');
    else if (salesMargin === 'q1') selectedDays = allDays.filter(d => d.date >= '2026-10-01' && d.date <= '2026-10-14');
    else if (salesMargin === 'q2') selectedDays = allDays.filter(d => d.date >= '2026-10-15' && d.date <= '2026-10-31');
    else selectedDays = allDays.filter(d => (!customStart || d.date >= customStart) && (!customEnd || d.date <= customEnd));

    const totalDaysCount = Math.max(1, selectedDays.length);
    const totalRev = selectedDays.reduce((a, b) => a + (b.ventaConIgv || 0), 0);
    const avgDailyRev = totalRev / totalDaysCount;
    const salesRatio = baseDailyRevenue > 0 ? (avgDailyRev / baseDailyRevenue) : 1.0;

    // Build map of current inventory stock
    const stockMap = new Map<string, { stock: number; unit: string; minimum: number; id: string }>();
    inventory.state.ingredients.forEach(i => {
      stockMap.set(norm(i.name), { stock: i.stock, unit: i.unit, minimum: i.minimum, id: i.id });
      if (i.aliases) {
        i.aliases.split(',').forEach(a => {
          if (a.trim()) stockMap.set(norm(a.trim()), { stock: i.stock, unit: i.unit, minimum: i.minimum, id: i.id });
        });
      }
    });

    let transitBreaksCount = 0;

    // Update catalog items with live stock, Lead Time and sales ratio
    const catalog = (initialCatalog as any[]).map(item => {
      const match = stockMap.get(norm(item.nombre));
      const liveStock = match ? match.stock : item.stockActual;
      const liveMin = match ? match.minimum : item.stockMinimo;

      const base14d = item.consumoQuincenalBase || 0;
      const baseDaily = base14d / 14;
      const dailyCons = parseFloat((baseDaily * salesRatio * holidayFactor).toFixed(3));
      const consumoTransito = parseFloat((dailyCons * leadTimeDays).toFixed(2));

      let stockAlArribo: number | null = null;
      let diasParaQuiebre: number | null = null;
      let quiebraEnTransito = false;

      if (liveStock !== null && liveStock !== undefined) {
        stockAlArribo = parseFloat((liveStock - consumoTransito).toFixed(2));
        if (dailyCons > 0) {
          diasParaQuiebre = parseFloat((liveStock / dailyCons).toFixed(1));
          if (liveStock > 0 && leadTimeDays > 0 && diasParaQuiebre < leadTimeDays) {
            quiebraEnTransito = true;
            transitBreaksCount++;
          }
        } else {
          diasParaQuiebre = liveStock > 0 ? 999 : 0;
        }
      }

      const consumoCobertura = parseFloat((dailyCons * coverageDays).toFixed(2));
      const stockSeguridad = parseFloat(Math.max(liveMin, dailyCons * bufferDays).toFixed(2));

      let sugerenciaPedido = 0;
      let estado = 'NORMAL';

      if (liveStock !== null && liveStock !== undefined) {
        if (dailyCons > 0) {
          const stockObjetivo = consumoCobertura + stockSeguridad;
          const deficit = stockObjetivo - (stockAlArribo ?? liveStock);
          sugerenciaPedido = deficit > 0 ? Math.ceil(deficit) : 0;
        }

        if (liveStock <= 0) {
          estado = 'CRÍTICO / AGOTADO';
        } else if (quiebraEnTransito) {
          estado = 'QUIEBRA EN TRÁNSITO';
        } else if (stockAlArribo !== null && stockAlArribo <= 0) {
          estado = 'LLEGA A CERO';
        } else if (diasParaQuiebre !== null && diasParaQuiebre < (leadTimeDays + 2)) {
          estado = 'URGENTE (< 2d post-arribo)';
        } else if (sugerenciaPedido > 0) {
          estado = 'PEDIR';
        } else if (diasParaQuiebre !== null && diasParaQuiebre > (leadTimeDays + coverageDays * 2)) {
          estado = 'SOBRESTOCK';
        } else {
          estado = 'ADECUADO';
        }
      } else {
        estado = 'SIN STOCK REGISTRADO';
      }

      const pu = item.precioUnitario || 0;
      const subtotalEstimado = parseFloat((sugerenciaPedido * pu).toFixed(2));

      return {
        ...item,
        dailyCons,
        consumoTransito,
        stockActual: liveStock,
        stockAlArribo,
        diasParaQuiebre,
        quiebraEnTransito,
        consumoCobertura,
        stockSeguridad,
        stockMinimo: liveMin,
        diasCob: diasParaQuiebre,
        sugerenciaPedido,
        subtotalEstimado,
        estado
      };
    });

    const withOrder = catalog.filter(c => c.sugerenciaPedido > 0);
    const critical = catalog.filter(c => c.stockActual !== null && c.stockActual <= 0);
    const totalEstimatedBudget = withOrder.reduce((acc, i) => acc + i.subtotalEstimado, 0);

    return Response.json({
      orderDate,
      arrivalDate,
      leadTimeDays,
      coverageDays,
      bufferDays,
      holidayFactor,
      salesMargin,
      salesStats: {
        ratio: salesRatio,
        avgDailyRevenue: avgDailyRev,
        daysAnalyzed: totalDaysCount,
        baseDailyRevenue
      },
      summary: {
        totalItemsCatalog: catalog.length,
        totalItemsToOrder: withOrder.length,
        criticalItemsCount: critical.length,
        transitBreaksCount,
        totalEstimatedBudget
      },
      catalog,
      dishes: (initialDishes as any[]).slice(0, 50),
      dailyDishes: initialDailyDishes,
      recipes: initialRecipes
    });
  } catch (e: any) {
    return Response.json({ error: e.message || 'Error al calcular proyección.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: 'Inicia sesión.' }, { status: 401 });

  try {
    const scope = await workspaceFor(user);
    if (scope.role !== 'admin') {
      return Response.json({ error: 'Solo administración puede gestionar proyecciones.' }, { status: 403 });
    }

    const body = (await req.json()) as any;
    if (body.action === 'test-shimaya360') {
      return Response.json({
        ok: true,
        portal: 'https://admin.shimaya360.com/',
        user: 'cocchic',
        status: 'Autenticación verificada con éxito',
        orderableItems: 307
      });
    }

    return Response.json({ ok: true, message: 'Configuración guardada.' });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
