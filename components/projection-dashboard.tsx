'use client';

import { useState, useMemo } from 'react';
import {
  Calendar,
  Package,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Search,
  ExternalLink,
  Copy,
  Check,
  FileSpreadsheet,
  UtensilsCrossed,
  Sparkles,
  Info,
  CalendarDays,
  Percent,
  Coins,
  ChevronDown,
  Filter,
  Truck,
  Clock,
  ArrowRight,
  ShieldAlert,
  AlertCircle
} from 'lucide-react';
import type { State } from '../lib/inventory';
import rawCatalog from '../data/catalogo_proyeccion.json';
import rawDailyDishes from '../data/ventas_platos_diarios_compact.json';
import rawRecipes from '../data/recetas_platos.json';
import rawVentas from '../data/ventas.json';

interface CatalogItem {
  proid: string;
  categoria: string;
  codigo: string;
  nombre: string;
  unidad: string;
  precioUnitario?: number;
  consumoQuincenalBase: number;
  dailyCons: number;
  consumoTransito: number;
  stockActual: number | null;
  stockAlArribo: number | null;
  diasParaQuiebre: number | null;
  quiebraEnTransito: boolean;
  consumoCobertura: number;
  stockSeguridad: number;
  stockMinimo: number;
  diasCob: number | null;
  sugerenciaPedido: number;
  subtotalEstimado: number;
  estado: string;
}

function norm(str: string) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getTodayIso() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDaysIso(dateStr: string, days: number) {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  } catch {
    return dateStr;
  }
}

function formatDayName(dateStr: string) {
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
    return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
  } catch {
    return dateStr;
  }
}

export default function ProjectionDashboard({ state }: { state?: State }) {
  // Configuración de Fechas de Pedido y Llegada (Lead Time)
  const [orderDate, setOrderDate] = useState<string>(() => getTodayIso());
  const [arrivalDate, setArrivalDate] = useState<string>(() => addDaysIso(getTodayIso(), 3));
  const [coverageDays, setCoverageDays] = useState<number>(7); // Días que debe durar el pedido una vez llegue
  const [bufferDays, setBufferDays] = useState<number>(2); // Días de colchón de seguridad

  // Margen de Análisis de Ventas
  const [salesMargin, setSalesMargin] = useState<'last7' | 'last14' | 'last30' | 'october' | 'q1' | 'q2' | 'custom'>('last7');
  const [customStartDate, setCustomStartDate] = useState<string>('2026-10-25');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-11-07');
  const [holidayFactor, setHolidayFactor] = useState<number>(1.05); // +5% feriados / alta afluencia

  // Filtros de UI
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODAS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ORDER_ONLY' | 'TRANSIT_BREAK' | 'CRITICAL'>('ORDER_ONLY');
  const [activeTab, setActiveTab] = useState<'proyeccion' | 'platos' | 'recetas'>('proyeccion');
  const [copied, setCopied] = useState(false);

  // Platos día por día state
  const [selectedDay, setSelectedDay] = useState<string>('ALL');
  const [dishCategory, setDishCategory] = useState<string>('TODAS');
  const [dishSearch, setDishSearch] = useState<string>('');

  // Stock en vivo desde el estado de la base de datos de inventario
  const stockMap = useMemo(() => {
    const map = new Map<string, { stock: number; unit: string; minimum: number }>();
    if (state?.ingredients) {
      state.ingredients.forEach(i => {
        map.set(norm(i.name), { stock: i.stock, unit: i.unit, minimum: i.minimum });
        if (i.aliases) {
          i.aliases.split(',').forEach(a => {
            if (a.trim()) map.set(norm(a.trim()), { stock: i.stock, unit: i.unit, minimum: i.minimum });
          });
        }
      });
    }
    return map;
  }, [state]);

  // Lead time en días
  const leadTimeDays = useMemo(() => {
    if (!orderDate || !arrivalDate) return 0;
    const start = new Date(orderDate + 'T12:00:00Z').getTime();
    const end = new Date(arrivalDate + 'T12:00:00Z').getTime();
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [orderDate, arrivalDate]);

  // Estadísticas del margen de ventas seleccionado
  const salesStats = useMemo(() => {
    const allDays = ((rawVentas as any)?.days || []) as Array<{ date: string; ventaConIgv: number; ordersCount: number }>;
    if (!allDays.length) {
      return {
        ratio: 1.0,
        daysCount: 14,
        totalRevenue: 102886,
        avgDailyRevenue: 7349,
        baseDailyRevenue: 7349,
        dateRangeLabel: 'Quincena Base'
      };
    }

    const baseDays = allDays.filter(d => d.date >= '2026-10-01' && d.date <= '2026-10-14');
    const baseDailyRevenue = baseDays.length > 0 
      ? baseDays.reduce((acc, d) => acc + (d.ventaConIgv || 0), 0) / baseDays.length 
      : 7349;

    let selected: typeof allDays = [];
    let label = '';

    if (salesMargin === 'last7') {
      selected = allDays.slice(-7);
      label = `Últimos 7 días (${selected[0]?.date || ''} al ${selected[selected.length - 1]?.date || ''})`;
    } else if (salesMargin === 'last14') {
      selected = allDays.slice(-14);
      label = `Últimos 14 días (${selected[0]?.date || ''} al ${selected[selected.length - 1]?.date || ''})`;
    } else if (salesMargin === 'last30') {
      selected = allDays.slice(-30);
      label = `Últimos 30 días (${selected[0]?.date || ''} al ${selected[selected.length - 1]?.date || ''})`;
    } else if (salesMargin === 'october') {
      selected = allDays.filter(d => d.date >= '2026-10-01' && d.date <= '2026-10-31');
      label = 'Octubre Completo (01/10 al 31/10)';
    } else if (salesMargin === 'q1') {
      selected = allDays.filter(d => d.date >= '2026-10-01' && d.date <= '2026-10-14');
      label = '1ra Quincena Octubre (01/10 al 14/10)';
    } else if (salesMargin === 'q2') {
      selected = allDays.filter(d => d.date >= '2026-10-15' && d.date <= '2026-10-31');
      label = '2da Quincena Octubre (15/10 al 31/10)';
    } else {
      selected = allDays.filter(d => (!customStartDate || d.date >= customStartDate) && (!customEndDate || d.date <= customEndDate));
      label = `Personalizado (${customStartDate || ''} al ${customEndDate || ''})`;
    }

    const daysCount = Math.max(1, selected.length);
    const totalRevenue = selected.reduce((acc, d) => acc + (d.ventaConIgv || 0), 0);
    const avgDailyRevenue = totalRevenue / daysCount;
    const ratio = baseDailyRevenue > 0 ? (avgDailyRevenue / baseDailyRevenue) : 1.0;

    return {
      ratio,
      daysCount,
      totalRevenue,
      avgDailyRevenue,
      baseDailyRevenue,
      dateRangeLabel: label
    };
  }, [salesMargin, customStartDate, customEndDate]);

  // Cálculo dinámico del catálogo proyectado con simulación de Lead Time
  const catalog = useMemo<CatalogItem[]>(() => {
    return (rawCatalog as any[]).map(item => {
      const live = stockMap.get(norm(item.nombre));
      const liveStock = live ? live.stock : item.stockActual;
      const liveMin = live ? live.minimum : item.stockMinimo;

      const base14d = item.consumoQuincenalBase || 0;
      const baseDaily = base14d / 14;
      // Consumo diario ajustado por el ratio de ventas del período elegido y factor de demanda
      const dailyCons = parseFloat((baseDaily * salesStats.ratio * holidayFactor).toFixed(3));

      // Consumo en viaje mientras llega la mercadería
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
          }
        } else {
          diasParaQuiebre = liveStock > 0 ? 999 : 0;
        }
      }

      // Consumo durante el período de cobertura del nuevo pedido
      const consumoCobertura = parseFloat((dailyCons * coverageDays).toFixed(2));
      const stockSeguridad = parseFloat(Math.max(liveMin, dailyCons * bufferDays).toFixed(2));

      let sugerenciaPedido = 0;
      let estado = 'NORMAL';

      if (liveStock !== null && liveStock !== undefined) {
        if (dailyCons > 0) {
          const stockObjetivo = consumoCobertura + stockSeguridad;
          // El pedido debe cubrir el objetivo a partir del stock proyectado al momento del arribo
          const deficit = stockObjetivo - (stockAlArribo ?? liveStock);
          sugerenciaPedido = deficit > 0 ? Math.ceil(deficit) : 0;
        } else {
          sugerenciaPedido = 0;
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
  }, [stockMap, salesStats.ratio, holidayFactor, leadTimeDays, coverageDays, bufferDays]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    catalog.forEach(item => {
      if (item.categoria) set.add(item.categoria.toUpperCase());
    });
    return ['TODAS', ...Array.from(set).sort()];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    return catalog.filter(item => {
      const matchesSearch =
        search === '' ||
        item.nombre.toLowerCase().includes(search.toLowerCase()) ||
        item.codigo.includes(search);

      const matchesCategory =
        selectedCategory === 'TODAS' || item.categoria.toUpperCase() === selectedCategory;

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ORDER_ONLY' && item.sugerenciaPedido > 0) ||
        (statusFilter === 'TRANSIT_BREAK' && item.quiebraEnTransito) ||
        (statusFilter === 'CRITICAL' && item.stockActual !== null && item.stockActual <= 0);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [catalog, search, selectedCategory, statusFilter]);

  const summary = useMemo(() => {
    const toOrder = catalog.filter(i => i.sugerenciaPedido > 0);
    const critical = catalog.filter(i => i.stockActual !== null && i.stockActual <= 0);
    const transitBreaks = catalog.filter(i => i.quiebraEnTransito);
    const totalEstimatedBudget = toOrder.reduce((acc, i) => acc + i.subtotalEstimado, 0);

    return {
      totalToOrder: toOrder.length,
      totalCritical: critical.length,
      totalTransitBreaks: transitBreaks.length,
      totalCatalog: catalog.length,
      totalEstimatedBudget,
      leadTimeDays,
      coverageDays,
      orderDate,
      arrivalDate
    };
  }, [catalog, leadTimeDays, coverageDays, orderDate, arrivalDate]);

  // Datos de platos día por día
  const dailyDishesList = useMemo(() => {
    if (selectedDay === 'ALL') {
      return (rawDailyDishes.dishes || []).filter((d: any) => {
        const matchesSearch =
          dishSearch === '' ||
          d.name.toLowerCase().includes(dishSearch.toLowerCase()) ||
          (d.sku && d.sku.toLowerCase().includes(dishSearch.toLowerCase()));
        const matchesCat = dishCategory === 'TODAS' || d.cat === dishCategory;
        return matchesSearch && matchesCat;
      });
    }

    const dayObj = (rawDailyDishes.days || []).find((d: any) => d.date === selectedDay);
    if (!dayObj) return [];

    return dayObj.items.filter((i: any) => {
      const matchesSearch =
        dishSearch === '' ||
        i.name.toLowerCase().includes(dishSearch.toLowerCase()) ||
        (i.sku && i.sku.toLowerCase().includes(dishSearch.toLowerCase()));
      const matchesCat = dishCategory === 'TODAS' || i.cat === dishCategory;
      return matchesSearch && matchesCat;
    });
  }, [selectedDay, dishCategory, dishSearch]);

  const dishCategories = useMemo(() => {
    const set = new Set<string>();
    (rawDailyDishes.dishes || []).forEach((d: any) => {
      if (d.cat) set.add(d.cat);
    });
    return ['TODAS', ...Array.from(set).sort()];
  }, []);

  const currentDayStats = useMemo(() => {
    if (selectedDay === 'ALL') {
      return {
        label: 'Mes Completo (36 días auditados)',
        totalPlatos: Math.round(rawDailyDishes.grandTotalPlatos || 0),
        totalMonto: rawDailyDishes.grandTotalAmount || 0,
        itemsCount: (rawDailyDishes.dishes || []).length
      };
    }
    const dayObj = (rawDailyDishes.days || []).find((d: any) => d.date === selectedDay);
    return {
      label: dayObj ? `Día ${dayObj.dateFormatted}` : selectedDay,
      totalPlatos: dayObj?.totalPlatos || 0,
      totalMonto: dayObj?.totalAmount || 0,
      itemsCount: dayObj?.items?.length || 0
    };
  }, [selectedDay]);

  function copyOrderToClipboard() {
    const toOrder = catalog.filter(i => i.sugerenciaPedido > 0);
    const textLines = [
      `LISTA DE PEDIDO SHIMAYA360 - SIMULACIÓN CON LEAD TIME`,
      `Fecha Pedido: ${orderDate} | Fecha Llegada: ${arrivalDate} (${leadTimeDays} días de tránsito)`,
      `Cobertura requerida: ${coverageDays} días | Colchón de seguridad: ${bufferDays} días`,
      `Margen de Ventas: ${salesStats.dateRangeLabel} (Ratio: ${salesStats.ratio.toFixed(2)}x)`,
      `Presupuesto Total Estimado: S/ ${summary.totalEstimatedBudget.toFixed(2)} (${toOrder.length} insumos a pedir)`,
      `Insumos en riesgo de quiebre en tránsito: ${summary.totalTransitBreaks}`,
      '---------------------------------------------------------------------------------',
      'CÓDIGO | PEDIR | UNIDAD | STOCK HOY | AL ARRIBO | PRECIO UNIT. | SUBTOTAL | PRODUCTO',
      ...toOrder.map(i => {
        const pu = i.precioUnitario || 0;
        const sub = i.subtotalEstimado.toFixed(2);
        const arriboStr = i.stockAlArribo !== null ? `${i.stockAlArribo} ${i.unidad}` : '-';
        const hoyStr = i.stockActual !== null ? `${i.stockActual} ${i.unidad}` : '-';
        return `${i.codigo} | +${i.sugerenciaPedido} ${i.unidad} | Hoy: ${hoyStr} | Arribo: ${arriboStr} | S/ ${pu.toFixed(2)} | S/ ${sub} | ${i.nombre}`;
      })
    ];
    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function exportToCsv() {
    const toOrder = catalog.filter(i => i.sugerenciaPedido > 0);
    const headers = [
      'Codigo Planta',
      'Categoria',
      'Producto',
      'Unidad',
      'Precio Unitario',
      'Consumo Diario',
      'Stock Actual Hoy',
      'Consumo en Transito (' + leadTimeDays + 'd)',
      'Stock Simulado al Arribo',
      'Quiebra en Transito',
      'Consumo Cobertura (' + coverageDays + 'd)',
      'Cantidad a Pedir',
      'Subtotal Estimado',
      'Estado'
    ];
    const rows = toOrder.map(i => {
      const pu = i.precioUnitario || 0;
      return [
        i.codigo,
        i.categoria,
        `"${i.nombre.replace(/"/g, '""')}"`,
        i.unidad,
        pu,
        i.dailyCons,
        i.stockActual ?? '',
        i.consumoTransito,
        i.stockAlArribo ?? '',
        i.quiebraEnTransito ? 'SI' : 'NO',
        i.consumoCobertura,
        i.sugerenciaPedido,
        i.subtotalEstimado,
        `"${i.estado}"`
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Pedido_Proyectado_LeadTime_${orderDate}_a_${arrivalDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="w-full space-y-5">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-red-950 via-neutral-900 to-neutral-950 border border-red-900/40 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/40 border border-red-700/50 text-red-300 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Proyección Inteligente con Simulación de Lead Time
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              Proyección de Pedido a Planta — Shimaya Ramen
            </h1>
            <p className="text-neutral-400 text-xs mt-1 max-w-2xl">
              Simula exactamente con cuánto stock llegarás cuando arribe el camión de Lima para no quebrar en el camino.
              Cálculo con ventas de ID POS y precios oficiales de{' '}
              <a
                href="https://admin.shimaya360.com/"
                target="_blank"
                rel="noreferrer"
                className="text-red-400 underline hover:text-red-300 font-bold"
              >
                admin.shimaya360.com (cocchic)
              </a>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyOrderToClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-bold text-neutral-200 transition"
              title="Copiar lista de insumos con stock de llegada para rellenar en Shimaya360"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-neutral-400" />}
              {copied ? '¡Copiado!' : 'Copiar lista'}
            </button>
            <button
              onClick={exportToCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Exportar CSV
            </button>
            <a
              href="https://admin.shimaya360.com/ventas/pedidos/nuevo"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-red-800/50 text-xs font-bold text-red-300 transition"
            >
              <ExternalLink className="w-3.5 h-3.5 text-red-400" />
              Ir a Shimaya360
            </a>
          </div>
        </div>
      </div>

      {/* Visual Supply Chain Timeline */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-red-500" />
            Línea de Tiempo del Pedido & Simulación de Mercadería en Camino
          </span>
          {summary.totalTransitBreaks > 0 && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-[10px] font-black uppercase border border-red-200 dark:border-red-800 animate-pulse">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              {summary.totalTransitBreaks} insumos en quiebre antes del arribo
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {/* Paso 1: Pedido Emitido */}
          <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 relative">
            <div className="text-[10px] font-bold text-neutral-400 uppercase">1. Emisión del Pedido</div>
            <div className="text-sm font-black text-neutral-900 dark:text-white mt-0.5">
              {formatDayName(orderDate)}
            </div>
            <div className="text-[11px] text-neutral-500 mt-1">
              Conteo físico y stock de hoy en Chiclayo
            </div>
          </div>

          {/* Paso 2: Tránsito de Lima a Chiclayo */}
          <div className="p-3 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-900/40 relative">
            <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase flex items-center gap-1">
              <Truck className="w-3 h-3" />
              2. Mercadería en Viaje ({leadTimeDays} días)
            </div>
            <div className="text-sm font-black text-amber-800 dark:text-amber-300 mt-0.5">
              Consumo en Tránsito
            </div>
            <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
              El restaurante consume insumos mientras llega el camión
            </div>
          </div>

          {/* Paso 3: Llegada a Tienda */}
          <div className="p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 relative">
            <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase flex items-center gap-1">
              <Package className="w-3 h-3" />
              3. Descarga en Almacén
            </div>
            <div className="text-sm font-black text-blue-800 dark:text-blue-300 mt-0.5">
              {formatDayName(arrivalDate)}
            </div>
            <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
              Stock remanente simulado a la apertura de cajas
            </div>
          </div>

          {/* Paso 4: Cobertura Operativa */}
          <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 relative">
            <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              4. Cobertura Garantizada
            </div>
            <div className="text-sm font-black text-emerald-800 dark:text-emerald-300 mt-0.5">
              {coverageDays} días (+{bufferDays}d colchón)
            </div>
            <div className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-1">
              Abastecimiento asegurado hasta el próximo ciclo
            </div>
          </div>
        </div>
      </div>

      {/* Controles de Configuración Interactivos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Panel 1: Parámetros del Pedido y Fechas de Tránsito */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
            <span className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-red-500" />
              Fechas del Pedido y Arribo (Lead Time)
            </span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
              {leadTimeDays} días de viaje
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                Día en que harás el pedido
              </label>
              <input
                type="date"
                value={orderDate}
                onChange={e => {
                  const newOrder = e.target.value;
                  setOrderDate(newOrder);
                  // Mantener al menos el mismo lead time
                  if (newOrder > arrivalDate) {
                    setArrivalDate(addDaysIso(newOrder, leadTimeDays || 3));
                  }
                }}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <span className="text-[10px] text-neutral-400 mt-0.5 block">
                {formatDayName(orderDate)}
              </span>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                Día en que llegará la mercadería
              </label>
              <input
                type="date"
                value={arrivalDate}
                min={orderDate}
                onChange={e => setArrivalDate(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <span className="text-[10px] text-neutral-400 mt-0.5 block">
                {formatDayName(arrivalDate)}
              </span>
            </div>
          </div>

          {/* Accesos rápidos de llegada */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-[10px] font-semibold text-neutral-400">Atajos de llegada:</span>
            {[
              { label: '+2d (Mié)', days: 2 },
              { label: '+3d (Jue - Habitual)', days: 3 },
              { label: '+4d (Vie)', days: 4 },
              { label: '+5d (Sáb)', days: 5 }
            ].map(b => (
              <button
                key={b.days}
                onClick={() => setArrivalDate(addDaysIso(orderDate, b.days))}
                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition border ${
                  leadTimeDays === b.days
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Cobertura requerida del pedido y colchón */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                Días de Cobertura requerida
              </label>
              <select
                value={coverageDays}
                onChange={e => setCoverageDays(parseInt(e.target.value) || 7)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value={5}>5 días (Semana corta)</option>
                <option value={7}>7 días (1 semana completa)</option>
                <option value={10}>10 días</option>
                <option value={14}>14 días (Quincenal completo)</option>
                <option value={21}>21 días (3 semanas)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                Colchón de Seguridad
              </label>
              <select
                value={bufferDays}
                onChange={e => setBufferDays(parseInt(e.target.value) || 2)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value={0}>Sin colchón (0 días)</option>
                <option value={1}>1 día de seguridad</option>
                <option value={2}>2 días de seguridad (Recomendado)</option>
                <option value={3}>3 días de seguridad</option>
                <option value={4}>4 días de seguridad</option>
              </select>
            </div>
          </div>
        </div>

        {/* Panel 2: Margen de Análisis de Ventas (Ritmo de Demanda) */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-2">
            <span className="text-xs font-bold text-neutral-900 dark:text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              Margen de Análisis de Ventas (ID POS)
            </span>
            <span className="text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              Ratio: {salesStats.ratio.toFixed(2)}x
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                Ventana de Ventas a Analizar
              </label>
              <select
                value={salesMargin}
                onChange={e => setSalesMargin(e.target.value as any)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="last7">🔥 Últimos 7 días (Tendencia inmediata)</option>
                <option value="last14">📊 Últimos 14 días (2 semanas móviles)</option>
                <option value="last30">🗓️ Últimos 30 días (Promedio mensual)</option>
                <option value="october">📅 Mes de Octubre Completo (01 al 31)</option>
                <option value="q1">📌 1ra Quincena Octubre (01 al 14)</option>
                <option value="q2">📌 2da Quincena Octubre (15 al 31)</option>
                <option value="custom">⚙️ Rango Personalizado...</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-neutral-500 block mb-1">
                Factor Feriados / Afluencia
              </label>
              <select
                value={holidayFactor}
                onChange={e => setHolidayFactor(parseFloat(e.target.value))}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value={1.0}>1.00x — Demanda normal estándar</option>
                <option value={1.05}>1.05x — Feriado o fin de semana (+5%)</option>
                <option value={1.1}>1.10x — Alta afluencia (+10%)</option>
                <option value={1.15}>1.15x — Temporada pico (+15%)</option>
              </select>
            </div>
          </div>

          {/* Inputs de Rango Personalizado (si está activo) */}
          {salesMargin === 'custom' && (
            <div className="grid grid-cols-2 gap-2 p-2.5 bg-neutral-50 dark:bg-neutral-800/60 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs">
              <div>
                <span className="text-[9px] font-bold uppercase text-neutral-500 block">Desde</span>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs font-semibold"
                />
              </div>
              <div>
                <span className="text-[9px] font-bold uppercase text-neutral-500 block">Hasta</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="w-full bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-lg px-2 py-1 text-xs font-semibold"
                />
              </div>
            </div>
          )}

          {/* Métricas del margen en vivo */}
          <div className="p-2.5 rounded-xl bg-neutral-50 dark:bg-neutral-800/40 border border-neutral-200 dark:border-neutral-700 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-medium">Margen analizado:</span>
              <strong className="text-neutral-900 dark:text-white font-bold">{salesStats.dateRangeLabel}</strong>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 font-medium">Venta Diaria Promedio:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                S/ {salesStats.avgDailyRevenue.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / día
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-400">
              <span>Comparado contra base (S/ {salesStats.baseDailyRevenue.toFixed(0)}/d):</span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                {salesStats.ratio >= 1 ? `+${((salesStats.ratio - 1) * 100).toFixed(1)}%` : `${((salesStats.ratio - 1) * 100).toFixed(1)}%`}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Principales */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Insumos a Pedir</span>
            <Package className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="text-xl font-black mt-1 text-red-600 dark:text-red-400">
            {summary.totalToOrder} <span className="text-xs font-normal text-neutral-400">líneas</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Reposición óptima</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Presupuesto Estimado</span>
            <Coins className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
            S/ {summary.totalEstimatedBudget.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Costo total reposición</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Quiebran en Tránsito</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className={`text-xl font-black mt-1 ${summary.totalTransitBreaks > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-neutral-400'}`}>
            {summary.totalTransitBreaks} <span className="text-xs font-normal text-neutral-400">insumos</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Se agotan antes de llegar</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Agotados Hoy</span>
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="text-xl font-black mt-1 text-red-700 dark:text-red-400">
            {summary.totalCritical} <span className="text-xs font-normal text-neutral-400">insumos</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Stock Chiclayo ≤ 0</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Lead Time / Espera</span>
            <Truck className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-black mt-1 text-neutral-900 dark:text-white">
            {summary.leadTimeDays} <span className="text-xs font-normal text-neutral-400">días</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Llega: {formatDayName(arrivalDate)}</div>
        </div>
      </div>

      {/* Tabs Principales */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab('proyeccion')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'proyeccion'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Lista de Pedido con Simulación de Arribo ({summary.totalToOrder})
        </button>
        <button
          onClick={() => setActiveTab('platos')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'platos'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          <UtensilsCrossed className="w-3.5 h-3.5" />
          Platos Vendidos Día por Día ({rawDailyDishes.days?.length || 36} días)
        </button>
        <button
          onClick={() => setActiveTab('recetas')}
          className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'recetas'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Escandallo / Insumos por Plato ({Object.keys(rawRecipes).length})
        </button>
      </div>

      {/* TAB 1: LISTA DE PEDIDO CON SIMULACIÓN DE ARRIBO */}
      {activeTab === 'proyeccion' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Barra de filtros */}
          <div className="p-3.5 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Buscar insumo o código planta..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl w-56 focus:outline-none focus:ring-2 focus:ring-red-500 text-neutral-800 dark:text-neutral-200"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                {categories.map((c: string) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="inline-flex p-0.5 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <button
                  onClick={() => setStatusFilter('ORDER_ONLY')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                    statusFilter === 'ORDER_ONLY' ? 'bg-red-600 text-white' : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  Solo a pedir ({summary.totalToOrder})
                </button>
                <button
                  onClick={() => setStatusFilter('TRANSIT_BREAK')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition flex items-center gap-1 ${
                    statusFilter === 'TRANSIT_BREAK' ? 'bg-amber-600 text-white' : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3" />
                  Quiebran en Viaje ({summary.totalTransitBreaks})
                </button>
                <button
                  onClick={() => setStatusFilter('CRITICAL')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                    statusFilter === 'CRITICAL' ? 'bg-neutral-800 text-white' : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  Agotados ({summary.totalCritical})
                </button>
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                    statusFilter === 'ALL' ? 'bg-neutral-800 text-white' : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  Todos ({summary.totalCatalog})
                </button>
              </div>
            </div>

            <div className="text-xs text-neutral-500 font-medium">
              Mostrando <strong className="text-neutral-900 dark:text-white">{filteredCatalog.length}</strong> insumos
            </div>
          </div>

          {/* TABLA AJUSTADA AL 100% SIN SCROLL HORIZONTAL */}
          <div className="w-full">
            <table className="w-full table-fixed text-left border-collapse text-xs">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[20%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Insumo Oficial (Shimaya360)</th>
                  <th className="py-2.5 px-3 text-right">Precio Unit.</th>
                  <th className="py-2.5 px-3 text-right">Ritmo de Consumo</th>
                  <th className="py-2.5 px-3 text-right">Stock Hoy ➔ Al Arribo ({leadTimeDays}d)</th>
                  <th className="py-2.5 px-3 text-center bg-red-50/40 dark:bg-red-950/20 text-red-700 dark:text-red-300">
                    A Pedir ({coverageDays}d) & Subtotal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-medium">
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-neutral-400">
                      No se encontraron insumos con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredCatalog.map(item => {
                    const isOrderNeeded = item.sugerenciaPedido > 0;
                    return (
                      <tr
                        key={item.proid || item.codigo || item.nombre}
                        className={`hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition ${
                          item.quiebraEnTransito
                            ? 'bg-amber-50/20 dark:bg-amber-950/10'
                            : isOrderNeeded
                            ? 'bg-red-50/10'
                            : ''
                        }`}
                      >
                        {/* Col 1: Insumo Oficial, Código y Categoría */}
                        <td className="py-2.5 px-3 align-middle">
                          <div className="font-bold text-neutral-900 dark:text-neutral-100 text-xs truncate" title={item.nombre}>
                            {item.nombre}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px]">
                            {item.codigo && (
                              <span className="font-mono px-1 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-bold">
                                #{item.codigo}
                              </span>
                            )}
                            <span className="px-1.5 py-0.2 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400">
                              {item.categoria}
                            </span>
                            <span className="text-neutral-400 font-semibold">• {item.unidad}</span>
                          </div>
                        </td>

                        {/* Col 2: Precio Unitario */}
                        <td className="py-2.5 px-3 align-middle text-right">
                          {item.precioUnitario && item.precioUnitario > 0 ? (
                            <>
                              <div className="font-mono font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                                S/ {item.precioUnitario.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                por {item.unidad}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-400 text-xs">-</span>
                          )}
                        </td>

                        {/* Col 3: Ritmo de Consumo */}
                        <td className="py-2.5 px-3 align-middle text-right">
                          <div className="font-mono font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                            {item.dailyCons > 0 ? `${item.dailyCons.toFixed(2)} ${item.unidad}/d` : '-'}
                          </div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            Cob. {coverageDays}d: {item.consumoCobertura} {item.unidad}
                          </div>
                        </td>

                        {/* Col 4: Stock Hoy vs Stock al Arribo (Simulación) */}
                        <td className="py-2.5 px-3 align-middle text-right">
                          {item.stockActual !== null ? (
                            <>
                              <div className="flex items-center justify-end gap-1.5 font-mono text-xs">
                                <span className="text-neutral-400 font-normal">Hoy:</span>
                                <span className={`font-bold ${item.stockActual <= 0 ? 'text-red-500' : 'text-neutral-800 dark:text-neutral-200'}`}>
                                  {item.stockActual}
                                </span>
                                <span className="text-neutral-400 font-normal">➔</span>
                                <span
                                  className={`font-black ${
                                    item.stockAlArribo !== null && item.stockAlArribo <= 0
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-emerald-600 dark:text-emerald-400'
                                  }`}
                                  title={`Consumo en tránsito (${leadTimeDays}d): -${item.consumoTransito} ${item.unidad}`}
                                >
                                  {item.stockAlArribo} {item.unidad}
                                </span>
                              </div>
                              <div className="flex items-center justify-end gap-1 mt-0.5">
                                {item.quiebraEnTransito ? (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-red-600 text-white animate-pulse">
                                    <AlertTriangle className="w-2.5 h-2.5" />
                                    Quiebra en {item.diasParaQuiebre} d
                                  </span>
                                ) : item.stockActual <= 0 ? (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                                    Agotado hoy
                                  </span>
                                ) : item.stockAlArribo !== null && item.stockAlArribo <= 0 ? (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500 text-white">
                                    Llega a 0
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-neutral-400">
                                    Viaje: -{item.consumoTransito} {item.unidad}
                                  </span>
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-400 text-xs">-</span>
                          )}
                        </td>

                        {/* Col 5: A Pedir a Planta & Subtotal */}
                        <td className="py-2 px-3 align-middle">
                          {item.sugerenciaPedido > 0 ? (
                            <div
                              className={`border rounded-xl p-2 text-right shadow-sm ${
                                item.quiebraEnTransito
                                  ? 'bg-red-50 dark:bg-red-950/50 border-red-300 dark:border-red-800'
                                  : 'bg-red-50/50 dark:bg-red-950/30 border-red-200 dark:border-red-900/60'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                                    item.quiebraEnTransito
                                      ? 'bg-red-600 text-white'
                                      : item.estado.includes('CRÍTICO')
                                      ? 'bg-red-700 text-white'
                                      : item.estado.includes('URGENTE')
                                      ? 'bg-orange-500 text-white'
                                      : 'bg-amber-500 text-white'
                                  }`}
                                >
                                  {item.quiebraEnTransito
                                    ? 'Quiebra en viaje'
                                    : item.estado.includes('CRÍTICO')
                                    ? 'Crítico'
                                    : item.estado.includes('URGENTE')
                                    ? 'Urgente'
                                    : 'Pedir'}
                                </span>
                                <span className="font-black text-red-600 dark:text-red-400 text-xs sm:text-sm">
                                  +{item.sugerenciaPedido} {item.unidad}
                                </span>
                              </div>
                              {item.precioUnitario && item.precioUnitario > 0 ? (
                                <div className="font-mono font-bold text-neutral-900 dark:text-neutral-100 text-[11px] mt-0.5">
                                  Subtotal: S/ {item.subtotalEstimado.toFixed(2)}
                                </div>
                              ) : null}
                            </div>
                          ) : (
                            <div className="text-right">
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-lg">
                                <CheckCircle2 className="w-3 h-3" />
                                Cubierto (0)
                              </span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: PLATOS VENDIDOS DÍA POR DÍA (ID POS) */}
      {activeTab === 'platos' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <UtensilsCrossed className="w-4 h-4 text-red-500" />
                Ventas de Platos Día por Día (Extraído de ID POS)
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Historial auditado de platos e ítems vendidos en SHIMAYA-CHICLAYO día por día.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold">
                {currentDayStats.label}: {currentDayStats.totalPlatos} platos vendidos
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono font-bold">
                S/ {currentDayStats.totalMonto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Selector de Día y Filtros de Platos */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-neutral-500" />
              <select
                value={selectedDay}
                onChange={e => setSelectedDay(e.target.value)}
                className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="ALL">⭐ Todos los días acumulados ({Math.round(rawDailyDishes.grandTotalPlatos || 0)} platos)</option>
                {(rawDailyDishes.days || []).map((d: any) => (
                  <option key={d.date} value={d.date}>
                    {d.dateFormatted} ({d.totalPlatos} platos • S/ {d.totalAmount.toLocaleString('es-PE')})
                    {d.date === '2026-10-08' ? ' — 🎖️ Feriado Angamos' : ''}
                    {d.date === '2026-11-01' ? ' — 🎖️ Feriado Todos Santos' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Filtrar plato por nombre o SKU..."
                value={dishSearch}
                onChange={e => setDishSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl w-52 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <select
              value={dishCategory}
              onChange={e => setDishCategory(e.target.value)}
              className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              {dishCategories.map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <span className="text-[11px] text-neutral-400 ml-auto font-medium">
              Mostrando {dailyDishesList.length} platos
            </span>
          </div>

          {/* Cuadrícula de Platos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[600px] overflow-y-auto pr-1">
            {dailyDishesList.map((d: any, idx: number) => {
              const qty = selectedDay === 'ALL' ? d.totalQty : d.qty;
              const hasRecipe = Object.keys(rawRecipes).some(r => {
                const rNorm = norm(r);
                const dNorm = norm(d.name);
                return dNorm.includes(rNorm) || rNorm.includes(dNorm);
              });

              return (
                <div
                  key={idx}
                  className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-2.5 flex items-center justify-between hover:border-red-400 transition bg-neutral-50/40 dark:bg-neutral-800/20"
                >
                  <div className="min-w-0 pr-2">
                    <div className="text-xs font-bold text-neutral-900 dark:text-white truncate" title={d.name}>
                      {d.name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-neutral-500">
                      <span>{d.cat}</span>
                      {d.sku && <span className="font-mono text-neutral-400">• SKU: {d.sku}</span>}
                    </div>
                    {hasRecipe && (
                      <span className="inline-block mt-1 text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50">
                        ⚡ Con Receta Oficial
                      </span>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <div className="text-sm font-black text-red-600 dark:text-red-400">
                      {Math.round(qty)} <span className="text-[10px] font-normal text-neutral-500">und</span>
                    </div>
                    {selectedDay === 'ALL' && d.totalAmount ? (
                      <div className="text-[10px] font-mono text-neutral-400">
                        S/ {d.totalAmount.toFixed(0)}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: ESCANDALLO / INSUMOS POR PLATO */}
      {activeTab === 'recetas' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm md:text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Escandallo Oficial: Insumos que Lleva Cada Plato
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Fórmula de consumo de 49 recetas maestras cruzadas con las ventas día a día para calcular el consumo exacto proyectado a Planta.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[650px] overflow-y-auto pr-1">
            {Object.entries(rawRecipes as any).map(([dishName, recipe]: [string, any]) => (
              <div
                key={dishName}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 space-y-2 bg-neutral-50/50 dark:bg-neutral-800/30"
              >
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-1.5">
                  <span className="font-black text-xs text-neutral-900 dark:text-white truncate" title={dishName}>
                    {dishName}
                  </span>
                  <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                    {recipe.categoria}
                  </span>
                </div>
                <div className="space-y-1">
                  {recipe.insumos?.map((ins: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-700 dark:text-neutral-300 font-medium truncate pr-2">
                        • {ins.insumo}
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px] flex-shrink-0">
                        {ins.cantidad}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
