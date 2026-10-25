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
  Wine,
  Cake,
  GlassWater
} from 'lucide-react';
import { type State, isTrago } from '../lib/inventory';
import rawCatalog from '../data/catalogo_proyeccion.json';
import rawDailyDishes from '../data/ventas_platos_diarios_compact.json';
import rawRecipes from '../data/recetas_platos.json';

interface CatalogItem {
  proid: string;
  categoria: string;
  codigo: string;
  nombre: string;
  unidad: string;
  precioUnitario?: number;
  consumoQuincenalBase: number;
  consumo14dProyectado: number;
  stockActual: number | null;
  stockMinimo: number;
  diasCob: number | null;
  sugerenciaPedido: number;
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

export default function ProjectionDashboard({ state }: { state?: State }) {
  const [period, setPeriod] = useState<'01-14' | '15-31'>('01-14');
  const [holidayFactor, setHolidayFactor] = useState(1.05); // +5% feriado Todos los Santos 01/11
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODAS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ORDER_ONLY' | 'CRITICAL'>('ORDER_ONLY');
  const [activeTab, setActiveTab] = useState<'proyeccion' | 'platos' | 'recetas'>('proyeccion');
  const [copied, setCopied] = useState(false);

  // Platos día por día state
  const [selectedDay, setSelectedDay] = useState<string>('ALL'); // 'ALL' o 'YYYY-MM-DD'
  const [dishCategory, setDishCategory] = useState<string>('TODAS');
  const [dishSearch, setDishSearch] = useState<string>('');

  // Recetas state
  const [recipeCategory, setRecipeCategory] = useState<string>('TODAS');
  const [recipeSearch, setRecipeSearch] = useState<string>('');

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

  // Cálculo dinámico del catálogo proyectado (excluyendo licores / tragos)
  const catalog = useMemo<CatalogItem[]>(() => {
    return (rawCatalog as any[])
      .filter(item => !isTrago(item.nombre, item.categoria))
      .map(item => {
      const live = stockMap.get(norm(item.nombre));
      const liveStock = live ? live.stock : item.stockActual;
      const liveMin = live ? live.minimum : item.stockMinimo;

      const base14d = item.consumoQuincenalBase || 0;
      const periodMultiplier = period === '01-14' ? 1.0 : 1.05;
      const consumo14dProyectado = parseFloat((base14d * holidayFactor * periodMultiplier).toFixed(2));
      const dailyCons = consumo14dProyectado / (period === '01-14' ? 14 : 16);

      let diasCob = null;
      let sugerenciaPedido = 0;
      let estado = 'NORMAL';

      if (liveStock !== null && liveStock !== undefined) {
        if (dailyCons > 0) {
          diasCob = parseFloat((liveStock / dailyCons).toFixed(1));
          const buffer = dailyCons * 3; // 3 días de colchón de seguridad
          const deficit = (consumo14dProyectado + Math.max(liveMin, buffer)) - liveStock;
          sugerenciaPedido = deficit > 0 ? Math.ceil(deficit) : 0;
        } else {
          diasCob = liveStock > 0 ? 999 : 0;
          sugerenciaPedido = 0;
        }

        if (liveStock <= 0) {
          estado = 'CRÍTICO / AGOTADO';
        } else if (diasCob < 5) {
          estado = 'URGENTE (< 5 días)';
        } else if (diasCob < 12) {
          estado = 'PEDIR (5 a 12 días)';
        } else if (diasCob <= 20) {
          estado = 'ADECUADO';
        } else {
          estado = 'SOBRESTOCK';
        }
      } else {
        estado = 'SIN STOCK REGISTRADO';
      }

      return {
        ...item,
        consumo14dProyectado,
        stockActual: liveStock,
        stockMinimo: liveMin,
        diasCob,
        sugerenciaPedido,
        estado
      };
    });
  }, [stockMap, period, holidayFactor]);

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
        (statusFilter === 'CRITICAL' && item.stockActual !== null && item.stockActual <= 0);

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [catalog, search, selectedCategory, statusFilter]);

  const summary = useMemo(() => {
    const toOrder = catalog.filter(i => i.sugerenciaPedido > 0);
    const critical = catalog.filter(i => i.stockActual !== null && i.stockActual <= 0);
    const totalEstimatedBudget = toOrder.reduce(
      (acc, i) => acc + i.sugerenciaPedido * (i.precioUnitario || 0),
      0
    );
    return {
      totalToOrder: toOrder.length,
      totalCritical: critical.length,
      totalCatalog: catalog.length,
      totalEstimatedBudget,
      targetDateRange: period === '01-14' ? '01/11/2026 al 14/11/2026' : '15/11/2026 al 30/11/2026',
      baseDateRange: period === '01-14' ? '01/10/2026 al 14/10/2026' : '15/10/2026 al 31/10/2026'
    };
  }, [catalog, period]);

  // Datos de platos día por día
  const dailyDishesList = useMemo(() => {
    if (selectedDay === 'ALL') {
      return (rawDailyDishes.dishes || []).filter(d => {
        const matchesSearch =
          dishSearch === '' ||
          d.name.toLowerCase().includes(dishSearch.toLowerCase()) ||
          (d.sku && d.sku.toLowerCase().includes(dishSearch.toLowerCase()));
        const matchesCat = dishCategory === 'TODAS' || d.cat === dishCategory;
        return matchesSearch && matchesCat;
      });
    }

    const dayObj = (rawDailyDishes.days || []).find(d => d.date === selectedDay);
    if (!dayObj) return [];

    return dayObj.items.filter(i => {
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
    (rawDailyDishes.dishes || []).forEach(d => {
      if (d.cat) set.add(d.cat);
    });
    return ['TODAS', ...Array.from(set).sort()];
  }, []);

  const recipeCategories = useMemo(() => {
    const set = new Set<string>();
    Object.values(rawRecipes as any).forEach((r: any) => {
      if (r.categoria) set.add(r.categoria);
    });
    return ['TODAS', ...Array.from(set).sort()];
  }, []);

  const filteredRecipes = useMemo(() => {
    return Object.entries(rawRecipes as any).filter(([dishName, r]: [string, any]) => {
      const matchesSearch =
        recipeSearch === '' ||
        dishName.toLowerCase().includes(recipeSearch.toLowerCase()) ||
        (r.insumos && r.insumos.some((ins: any) => ins.insumo.toLowerCase().includes(recipeSearch.toLowerCase())));
      const matchesCat = recipeCategory === 'TODAS' || r.categoria === recipeCategory;
      return matchesSearch && matchesCat;
    });
  }, [recipeCategory, recipeSearch]);

  const currentDayStats = useMemo(() => {
    if (selectedDay === 'ALL') {
      return {
        label: 'Mes Completo (01/10 al 24/10)',
        totalPlatos: rawDailyDishes.grandTotalPlatos || 0,
        totalMonto: rawDailyDishes.grandTotalAmount || 0,
        itemsCount: (rawDailyDishes.dishes || []).length
      };
    }
    const dayObj = (rawDailyDishes.days || []).find(d => d.date === selectedDay);
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
      `LISTA DE PEDIDO SHIMAYA360 - QUINCENA ${period === '01-14' ? '01/11 AL 14/11' : '15/11 AL 30/11'}`,
      `Usuario: cocchic | Portal: https://admin.shimaya360.com/`,
      `Presupuesto Total Estimado: S/ ${summary.totalEstimatedBudget.toFixed(2)}`,
      `Generado: ${new Date().toLocaleDateString('es-PE')}`,
      '---------------------------------------------------------------------------------',
      'CÓDIGO | CANTIDAD | UNIDAD | PRECIO UNIT. | SUBTOTAL EST. | PRODUCTO',
      ...toOrder.map(i => {
        const pu = i.precioUnitario || 0;
        const sub = (i.sugerenciaPedido * pu).toFixed(2);
        return `${i.codigo} | ${i.sugerenciaPedido} ${i.unidad} | S/ ${pu.toFixed(2)} | S/ ${sub} | ${i.nombre}`;
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
      'Consumo 14d',
      'Stock Actual',
      'Cantidad a Pedir',
      'Subtotal Estimado',
      'Estado'
    ];
    const rows = toOrder.map(i => {
      const pu = i.precioUnitario || 0;
      const sub = (i.sugerenciaPedido * pu).toFixed(2);
      return [
        i.codigo,
        i.categoria,
        `"${i.nombre.replace(/"/g, '""')}"`,
        i.unidad,
        pu,
        i.consumo14dProyectado,
        i.stockActual ?? '',
        i.sugerenciaPedido,
        sub,
        `"${i.estado}"`
      ];
    });
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Proyeccion_Pedido_${period}_Shimaya360.csv`);
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
              Proyección de Pedidos Quincenales — Pantalla Única
            </div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight">
              Proyección de Pedido a Planta — Shimaya Ramen
            </h1>
            <p className="text-neutral-400 text-xs mt-1 max-w-2xl">
              Cálculo con ventas reales día a día de ID POS, explosión por recetas del escandallo y precios del catálogo de{' '}
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
              title="Copiar lista de insumos a pedir para rellenar en Shimaya360"
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

      {/* Controles y Ajuste por Feriados */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                Período de Proyección
              </span>
              <div className="inline-flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
                <button
                  onClick={() => setPeriod('01-14')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    period === '01-14'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  1ra Quincena (01 al 14)
                </button>
                <button
                  onClick={() => setPeriod('15-31')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                    period === '15-31'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  2da Quincena (15 al 30/31)
                </button>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block mb-1">
                Ajuste por Feriados / Demanda
              </span>
              <select
                value={holidayFactor}
                onChange={e => setHolidayFactor(parseFloat(e.target.value))}
                className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value={1.0}>Sin ajuste adicional (1.00x)</option>
                <option value={1.05}>Feriado Todos los Santos (+5% sugerido)</option>
                <option value={1.1}>Alta demanda / Fin de semana largo (+10%)</option>
                <option value={1.15}>Temporada pico (+15%)</option>
              </select>
            </div>
          </div>

          <div className="text-right text-xs text-neutral-500">
            <span className="font-bold text-neutral-700 dark:text-neutral-300">
              Proyección: {summary.targetDateRange}
            </span>
            <div className="text-[11px] text-neutral-400">
              Base comparativa: {summary.baseDateRange}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Insumos a Pedir</span>
            <Package className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="text-xl font-black mt-1 text-red-600 dark:text-red-400">
            {summary.totalToOrder} <span className="text-xs font-normal text-neutral-400">líneas</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Reposición a Planta</div>
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
            <span>Stock en Quiebre (0)</span>
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="text-xl font-black mt-1 text-amber-600 dark:text-amber-400">
            {summary.totalCritical} <span className="text-xs font-normal text-neutral-400">insumos</span>
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Stock Chiclayo ≤ 0</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Ventas ID POS Mes</span>
            <UtensilsCrossed className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <div className="text-xl font-black mt-1 text-neutral-900 dark:text-white">
            {rawDailyDishes.grandTotalPlatos?.toLocaleString('es-PE') || '6,659'}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Platos en 24 días</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 text-[10px] font-bold uppercase">
            <span>Catálogo Shimaya360</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xl font-black mt-1 text-neutral-900 dark:text-white">
            {summary.totalCatalog}
          </div>
          <div className="text-[10px] text-neutral-400 mt-0.5">Insumos de Planta</div>
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
          Lista de Pedido a Planta ({summary.totalToOrder})
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
          Platos Vendidos Día por Día ({rawDailyDishes.days?.length || 24} días)
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

      {/* TAB 1: LISTA DE PEDIDO — PANTALLA ÚNICA SIN SCROLL HORIZONTAL */}
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
                  onClick={() => setStatusFilter('CRITICAL')}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition ${
                    statusFilter === 'CRITICAL' ? 'bg-amber-600 text-white' : 'text-neutral-600 dark:text-neutral-400'
                  }`}
                >
                  Críticos ({summary.totalCritical})
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
                <col className="w-[34%]" />
                <col className="w-[12%]" />
                <col className="w-[16%]" />
                <col className="w-[15%]" />
                <col className="w-[23%]" />
              </colgroup>
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Insumo Oficial (Shimaya360)</th>
                  <th className="py-2.5 px-3 text-right">Precio Unit.</th>
                  <th className="py-2.5 px-3 text-right">Consumo & Cobertura</th>
                  <th className="py-2.5 px-3 text-right">Stock Almacén</th>
                  <th className="py-2.5 px-3 text-center bg-red-50/40 dark:bg-red-950/20 text-red-700 dark:text-red-300">
                    A Pedir a Planta & Subtotal
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
                          isOrderNeeded ? 'bg-red-50/10' : ''
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

                        {/* Col 3: Consumo 14d & Cobertura */}
                        <td className="py-2.5 px-3 align-middle text-right">
                          <div className="font-mono font-bold text-neutral-800 dark:text-neutral-200 text-xs">
                            {item.consumo14dProyectado > 0 ? `${item.consumo14dProyectado.toFixed(1)} ${item.unidad}` : '-'}
                          </div>
                          <div className="mt-0.5">
                            {item.diasCob !== null ? (
                              <span
                                className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  item.diasCob < 5
                                    ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                    : item.diasCob < 12
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                }`}
                              >
                                {item.diasCob > 99 ? '> 99 d cob.' : `${item.diasCob} d cob.`}
                              </span>
                            ) : (
                              <span className="text-neutral-400 text-[10px]">-</span>
                            )}
                          </div>
                        </td>

                        {/* Col 4: Stock Almacén Chiclayo */}
                        <td className="py-2.5 px-3 align-middle text-right">
                          {item.stockActual !== null ? (
                            <>
                              <div
                                className={`font-mono font-bold text-xs ${
                                  item.stockActual <= 0
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-neutral-900 dark:text-neutral-100'
                                }`}
                              >
                                {item.stockActual <= 0 ? '0.00 (Quiebre)' : `${item.stockActual} ${item.unidad}`}
                              </div>
                              <div className="text-[10px] text-neutral-400 mt-0.5">
                                mín: {item.stockMinimo || 0}
                              </div>
                            </>
                          ) : (
                            <span className="text-neutral-400 text-xs">-</span>
                          )}
                        </td>

                        {/* Col 5: A Pedir a Planta & Subtotal */}
                        <td className="py-2 px-3 align-middle">
                          {item.sugerenciaPedido > 0 ? (
                            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 rounded-xl p-2 text-right shadow-sm">
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                                    item.estado.includes('CRÍTICO')
                                      ? 'bg-red-600 text-white'
                                      : item.estado.includes('URGENTE')
                                      ? 'bg-orange-500 text-white'
                                      : 'bg-amber-500 text-white'
                                  }`}
                                >
                                  {item.estado.includes('CRÍTICO') ? 'Crítico' : item.estado.includes('URGENTE') ? 'Urgente' : 'Pedir'}
                                </span>
                                <span className="font-black text-red-600 dark:text-red-400 text-xs sm:text-sm">
                                  +{item.sugerenciaPedido} {item.unidad}
                                </span>
                              </div>
                              {item.precioUnitario && item.precioUnitario > 0 ? (
                                <div className="font-mono font-bold text-neutral-900 dark:text-neutral-100 text-[11px] mt-0.5">
                                  Subtotal: S/ {(item.sugerenciaPedido * item.precioUnitario).toFixed(2)}
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
                Historial auditado de platos e ítems vendidos en SHIMAYA-CHICLAYO (01/10 al 24/10).
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

          {/* Botones de filtro rápido por categoría */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
            <button
              onClick={() => setDishCategory('TODAS')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                dishCategory === 'TODAS'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              ⭐ Todas las Categorías
            </button>
            <button
              onClick={() => setDishCategory('COCTELES')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                dishCategory === 'COCTELES'
                  ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-400'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 hover:bg-purple-100'
              }`}
            >
              <Wine className="w-3.5 h-3.5" />
              🍹 Solo Cócteles (124 und • S/ 2,664)
            </button>
            <button
              onClick={() => setDishCategory('POSTRES')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
                dishCategory === 'POSTRES'
                  ? 'bg-pink-600 text-white shadow-sm ring-2 ring-pink-400'
                  : 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800 hover:bg-pink-100'
              }`}
            >
              <Cake className="w-3.5 h-3.5" />
              🍰 Postres (Cheesecake & Puchikurimo)
            </button>
            <button
              onClick={() => setDishCategory('MAKIS')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                dishCategory === 'MAKIS'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              🍱 Makis
            </button>
            <button
              onClick={() => setDishCategory('RAMEN')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                dishCategory === 'RAMEN'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              🍜 Ramen
            </button>
            <button
              onClick={() => setDishCategory('FONDOS')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                dishCategory === 'FONDOS'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              🍛 Fondos
            </button>
            <button
              onClick={() => setDishCategory('COMBOS')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition ${
                dishCategory === 'COMBOS'
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-sm'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
              }`}
            >
              📦 Combos
            </button>
          </div>

          {/* Banner de Cócteles */}
          {dishCategory === 'COCTELES' && (
            <div className="bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-amber-500/10 border border-purple-200 dark:border-purple-800/50 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-lg bg-purple-500/20 text-purple-600 dark:text-purple-300">
                  <Wine className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                    🍹 Venta Exclusiva de Cócteles (124 unidades • S/ 2,664.00)
                  </h3>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5">
                    Filtro exclusivo para coctelería de autor y clásicos. <strong>Se excluyeron al 100% las gaseosas, jugos, aguas y tés</strong>.
                    Incluye Tokyo Mule (40), Sakerinha (26), Mojito (23), Dragon Tonic (17) y Chilcanos (18).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start md:self-auto">
                <span className="px-3 py-1 rounded-xl bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800 text-purple-900 dark:text-purple-200 text-xs font-black">
                  124 cócteles
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-mono text-xs font-bold">
                  S/ 2,664.00
                </span>
              </div>
            </div>
          )}

          {/* Banner de Postres */}
          {dishCategory === 'POSTRES' && (
            <div className="bg-gradient-to-r from-pink-500/10 via-rose-500/10 to-amber-500/10 border border-pink-200 dark:border-pink-800/50 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <div className="p-2 rounded-lg bg-pink-500/20 text-pink-600 dark:text-pink-300">
                  <Cake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs md:text-sm font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                    🍰 Postres Considerados: Cheesecake Japonés y Púchikurimu
                  </h3>
                  <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5">
                    Integrados con su receta oficial en el catálogo para el cálculo automático de consumos hacia Planta.
                    Cheesecake Japonés (48 und • S/ 1,200.00) y Púchikurimu (17 und • S/ 255.00).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-start md:self-auto">
                <span className="px-3 py-1 rounded-xl bg-pink-100 dark:bg-pink-950/60 border border-pink-200 dark:border-pink-800 text-pink-900 dark:text-pink-200 text-xs font-black">
                  65 postres
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-mono text-xs font-bold">
                  S/ 1,455.00
                </span>
              </div>
            </div>
          )}

          {/* Selector de Día y Filtros de Platos */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-neutral-500" />
              <select
                value={selectedDay}
                onChange={e => setSelectedDay(e.target.value)}
                className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-xl px-2.5 py-1.5 text-xs font-bold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="ALL">⭐ Todos los 24 días acumulados ({rawDailyDishes.grandTotalPlatos} platos)</option>
                {(rawDailyDishes.days || []).map(d => (
                  <option key={d.date} value={d.date}>
                    {d.dateFormatted} ({d.totalPlatos} platos • S/ {d.totalAmount.toLocaleString('es-PE')})
                    {d.date === '2026-10-08' ? ' — 🎖️ Feriado Angamos' : ''}
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
                      {qty} <span className="text-[10px] font-normal text-neutral-500">und</span>
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
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm md:text-base font-bold text-neutral-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Escandallo Oficial: Insumos que Lleva Cada Plato ({Object.keys(rawRecipes).length} recetas)
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Fórmula de consumo de recetas maestras (incluye Cheesecake, Púchikurimo y Cócteles) cruzadas con las ventas día a día.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">
                {filteredRecipes.length} de {Object.keys(rawRecipes).length} recetas
              </span>
            </div>
          </div>

          {/* Filtros de recetas */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input
                type="text"
                placeholder="Buscar receta o insumo..."
                value={recipeSearch}
                onChange={e => setRecipeSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl w-60 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto py-1">
              {['TODAS', 'Postres', 'Coctelería', 'Ramen', 'Makis'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setRecipeCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition whitespace-nowrap ${
                    recipeCategory === cat
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200'
                  }`}
                >
                  {cat === 'TODAS' ? '⭐ Todas' : cat === 'Postres' ? '🍰 Postres' : cat === 'Coctelería' ? '🍹 Cócteles' : cat}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-neutral-400 ml-auto font-medium">
              Mostrando {filteredRecipes.length} recetas
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[650px] overflow-y-auto pr-1">
            {filteredRecipes.map(([dishName, recipe]: [string, any]) => (
              <div
                key={dishName}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 space-y-2 bg-neutral-50/50 dark:bg-neutral-800/30"
              >
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-1.5">
                  <span className="font-black text-xs text-neutral-900 dark:text-white truncate" title={dishName}>
                    {dishName}
                  </span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${
                    recipe.categoria === 'Postres'
                      ? 'bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300'
                      : recipe.categoria === 'Coctelería'
                      ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                      : 'bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300'
                  }`}>
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
