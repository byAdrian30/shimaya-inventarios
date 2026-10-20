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
  Percent
} from 'lucide-react';
import type { State } from '../lib/inventory';
import rawCatalog from '../data/catalogo_proyeccion.json';
import rawDishes from '../data/ventas_platos_01_14_octubre.json';
import rawRecipes from '../data/recetas_platos.json';

interface CatalogItem {
  proid: string;
  categoria: string;
  codigo: string;
  nombre: string;
  unidad: string;
  consumoQuincenalBase: number;
  consumo14dProyectado: number;
  stockActual: number | null;
  stockMinimo: number;
  diasCob: number | null;
  sugerenciaPedido: number;
  estado: string;
}

interface DishItem {
  producto: string;
  sku: string;
  subcat: string;
  categoria: string;
  cantidadSemana1: number;
  cantidadQuincena: number;
}

function norm(str: string) {
  if (!str) return '';
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ProjectionDashboard({ state }: { state?: State }) {
  const [period, setPeriod] = useState<'01-14' | '15-31'>('01-14');
  const [holidayFactor, setHolidayFactor] = useState(1.05); // +5% por feriado Todos los Santos 01/11
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('TODAS');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ORDER_ONLY' | 'CRITICAL'>('ORDER_ONLY');
  const [activeTab, setActiveTab] = useState<'proyeccion' | 'platos' | 'recetas'>('proyeccion');
  const [copied, setCopied] = useState(false);

  // Build live stock map from current state or fallback
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

  // Dynamically compute the projection catalog
  const catalog = useMemo<CatalogItem[]>(() => {
    return (rawCatalog as any[]).map(item => {
      const live = stockMap.get(norm(item.nombre));
      const liveStock = live ? live.stock : item.stockActual;
      const liveMin = live ? live.minimum : item.stockMinimo;

      // Base consumption adjustment
      const base14d = item.consumoQuincenalBase || 0;
      const periodMultiplier = period === '01-14' ? 1.0 : 1.05; // 2nd quincena has 16 days in Oct/Dec
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
  }, [rawCatalog, stockMap, period, holidayFactor]);

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
    return {
      totalToOrder: toOrder.length,
      totalCritical: critical.length,
      totalCatalog: catalog.length,
      targetDateRange: period === '01-14' ? '01/11/2026 al 14/11/2026' : '15/11/2026 al 30/11/2026',
      baseDateRange: period === '01-14' ? '01/10/2026 al 14/10/2026' : '15/10/2026 al 31/10/2026'
    };
  }, [catalog, period]);

  function copyOrderToClipboard() {
    const toOrder = catalog.filter(i => i.sugerenciaPedido > 0);
    const textLines = [
      `LISTA DE PEDIDO SHIMAYA360 - QUINCENA ${period === '01-14' ? '01/11 AL 14/11' : '15/11 AL 30/11'}`,
      `Usuario: cocchic | Portal: https://admin.shimaya360.com/`,
      `Generado: ${new Date().toLocaleDateString('es-PE')}`,
      '-------------------------------------------------------',
      'CÓDIGO | CANTIDAD | UNIDAD | PRODUCTO',
      ...toOrder.map(i => `${i.codigo} | ${i.sugerenciaPedido} ${i.unidad} | ${i.nombre}`)
    ];
    navigator.clipboard.writeText(textLines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function exportToCsv() {
    const toOrder = catalog.filter(i => i.sugerenciaPedido > 0);
    const headers = ['Codigo Planta', 'Categoria', 'Producto', 'Unidad', 'Consumo 14d', 'Stock Actual', 'Cantidad a Pedir', 'Estado'];
    const rows = toOrder.map(i => [
      i.codigo,
      i.categoria,
      `"${i.nombre.replace(/"/g, '""')}"`,
      i.unidad,
      i.consumo14dProyectado,
      i.stockActual ?? '',
      i.sugerenciaPedido,
      `"${i.estado}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Proyeccion_Pedido_${period}_Shimaya360.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="bg-gradient-to-r from-red-950 via-neutral-900 to-neutral-950 border border-red-900/40 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/40 border border-red-700/50 text-red-300 text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              Proyección Inteligente de Pedidos Quincenales
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Proyección de Pedido — Shimaya Ramen
            </h1>
            <p className="text-neutral-400 text-sm mt-1 max-w-2xl">
              Cálculo automatizado de insumos por quincenas basado en ventas del mes anterior, ajuste por feriados y cruce con el catálogo oficial de{' '}
              <a href="https://admin.shimaya360.com/" target="_blank" rel="noreferrer" className="text-red-400 underline hover:text-red-300 font-semibold">
                admin.shimaya360.com (cocchic)
              </a>.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={copyOrderToClipboard}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-semibold text-neutral-200 transition"
              title="Copiar lista para rellenar en admin.shimaya360.com"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-neutral-400" />}
              {copied ? '¡Copiado!' : 'Copiar para Shimaya360'}
            </button>
            <button
              onClick={exportToCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition shadow-md shadow-red-950"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Exportar CSV
            </button>
            <a
              href="https://admin.shimaya360.com/ventas/pedidos/nuevo"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-red-800/50 text-xs font-semibold text-red-300 transition"
            >
              <ExternalLink className="w-4 h-4 text-red-400" />
              Ir a Shimaya360 (cocchic)
            </a>
          </div>
        </div>
      </div>

      {/* Period Selection & Holiday Adjustment Controls */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Quincena Switcher */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-2">
              Seleccionar Período de Proyección
            </label>
            <div className="inline-flex p-1 bg-neutral-100 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <button
                onClick={() => setPeriod('01-14')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                  period === '01-14'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                1ra Quincena (01 al 14)
              </button>
              <button
                onClick={() => setPeriod('15-31')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                  period === '15-31'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                2da Quincena (15 al 30/31)
              </button>
            </div>
          </div>

          {/* Holiday factor selector */}
          <div className="flex items-center gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-2">
                Ajuste por Feriados / Festivos
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={holidayFactor}
                  onChange={e => setHolidayFactor(parseFloat(e.target.value))}
                  className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                >
                  <option value={1.0}>Sin ajuste adicional (1.00x)</option>
                  <option value={1.05}>Feriado regular (+5% de margen)</option>
                  <option value={1.1}>Feriado alto (+10% comensales)</option>
                  <option value={1.15}>Fin de semana largo (+15% afluencia)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Informative alert about the current projection */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Proyección Activa: {summary.targetDateRange}</span>
            {' — '}
            Basada en los platos consumidos del <strong>{summary.baseDateRange}</strong>.
            {period === '01-14' && (
              <span className="block mt-1 text-amber-800 dark:text-amber-300">
                ⭐ <strong>Feriados considerados:</strong> El período base tuvo el feriado del <strong>08 de Octubre (Angamos)</strong> y el período proyectado incluye el <strong>01 de Noviembre (Día de Todos los Santos)</strong>, asegurando correspondencia estacional y cobertura ante picos de demanda.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase">
            <span>Insumos a Pedir</span>
            <Package className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black mt-2 text-neutral-900 dark:text-white">
            {summary.totalToOrder}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Con necesidad de reposición</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase">
            <span>En Quiebre / Críticos</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black mt-2 text-amber-600 dark:text-amber-400">
            {summary.totalCritical}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Stock actual ≤ 0 en sistema</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase">
            <span>Platos Vendidos Base</span>
            <UtensilsCrossed className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black mt-2 text-neutral-900 dark:text-white">
            2,850
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Vendidos en la quincena 01-14</div>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400 text-xs font-bold uppercase">
            <span>Catálogo Shimaya360</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black mt-2 text-neutral-900 dark:text-white">
            {summary.totalCatalog}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Insumos oficiales de Planta</div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab('proyeccion')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'proyeccion'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          Lista de Pedido para Shimaya360 ({summary.totalToOrder})
        </button>
        <button
          onClick={() => setActiveTab('platos')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'platos'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          Platos Vendidos en el Período (01/10 al 14/10)
        </button>
        <button
          onClick={() => setActiveTab('recetas')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'recetas'
              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
              : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          Escandallo / Insumos por Plato
        </button>
      </div>

      {/* Main Table View */}
      {activeTab === 'proyeccion' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-sm overflow-hidden">
          {/* Filter Toolbar */}
          <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Buscar insumo o código..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl w-60 focus:outline-none focus:ring-2 focus:ring-red-500 text-neutral-800 dark:text-neutral-200"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl px-3 py-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-red-500"
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

            <div className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
              Mostrando {filteredCatalog.length} insumos
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-neutral-50 dark:bg-neutral-800/60 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500 dark:text-neutral-400 uppercase font-bold text-[10px] tracking-wider">
                  <th className="py-3 px-4">Cód. Planta</th>
                  <th className="py-3 px-4">Insumo Oficial (Shimaya360)</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Unidad</th>
                  <th className="py-3 px-4 text-right">Consumo 14d</th>
                  <th className="py-3 px-4 text-right">Stock Actual</th>
                  <th className="py-3 px-4 text-center bg-red-50/50 dark:bg-red-950/20 text-red-700 dark:text-red-300">
                    A Pedir (14d)
                  </th>
                  <th className="py-3 px-4 text-right">Cobertura</th>
                  <th className="py-3 px-4">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-medium">
                {filteredCatalog.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-10 text-neutral-400">
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
                          isOrderNeeded ? 'font-semibold' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono text-neutral-500">{item.codigo || '-'}</td>
                        <td className="py-2.5 px-4 text-neutral-900 dark:text-neutral-100 font-bold">
                          {item.nombre}
                        </td>
                        <td className="py-2.5 px-4 text-neutral-500">{item.categoria}</td>
                        <td className="py-2.5 px-4 text-neutral-600 dark:text-neutral-300">{item.unidad}</td>
                        <td className="py-2.5 px-4 text-right font-mono text-neutral-600 dark:text-neutral-400">
                          {item.consumo14dProyectado > 0 ? item.consumo14dProyectado.toFixed(1) : '-'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">
                          {item.stockActual !== null ? (
                            <span
                              className={
                                item.stockActual <= 0
                                  ? 'text-red-600 dark:text-red-400 font-bold'
                                  : 'text-neutral-800 dark:text-neutral-200'
                              }
                            >
                              {item.stockActual}
                            </span>
                          ) : (
                            <span className="text-neutral-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center bg-red-50/40 dark:bg-red-950/20 font-black">
                          {item.sugerenciaPedido > 0 ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full bg-red-600 text-white text-xs shadow-sm">
                              {item.sugerenciaPedido} {item.unidad}
                            </span>
                          ) : (
                            <span className="text-neutral-400 font-normal">0</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono">
                          {item.diasCob !== null ? (
                            <span
                              className={
                                item.diasCob < 5
                                  ? 'text-red-600 dark:text-red-400 font-bold'
                                  : item.diasCob < 12
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }
                            >
                              {item.diasCob > 100 ? '> 100 d' : `${item.diasCob} d`}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              item.estado.includes('CRÍTICO')
                                ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                                : item.estado.includes('URGENTE')
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
                                : item.estado.includes('PEDIR')
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                : item.estado.includes('ADECUADO')
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                            }`}
                          >
                            {item.estado}
                          </span>
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

      {/* Dishes View */}
      {activeTab === 'platos' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Platos Vendidos en el Período Base (01/10 al 14/10)
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Platos extraídos del POS con impacto por feriado del 08/10 e insumos vinculados.
              </p>
            </div>
            <div className="text-xs font-bold px-3 py-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg text-neutral-700 dark:text-neutral-300">
              Total platos registrados: {(rawDishes as any[]).length}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {(rawDishes as any[]).slice(0, 60).map((d: DishItem, idx: number) => (
              <div
                key={idx}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-3 flex items-center justify-between hover:border-red-400 transition"
              >
                <div>
                  <div className="text-xs font-bold text-neutral-900 dark:text-white">{d.producto}</div>
                  <div className="text-[10px] text-neutral-500">
                    {d.subcat} • SKU: {d.sku || 'N/A'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-black text-red-600 dark:text-red-400">
                    {d.cantidadQuincena} <span className="text-[10px] font-normal text-neutral-500">und</span>
                  </div>
                  <div className="text-[10px] text-neutral-400">Sem 1: {d.cantidadSemana1} u</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recipes View */}
      {activeTab === 'recetas' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">
              Escandallo Oficial: Insumos que Lleva Cada Plato
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Fórmula de consumo extraída de la hoja VENTA REAL del Auditor de 42 días para calcular la explosión de insumos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(rawRecipes as any).map(([dishName, recipe]: [string, any]) => (
              <div
                key={dishName}
                className="border border-neutral-200 dark:border-neutral-800 rounded-xl p-4 space-y-2.5 bg-neutral-50/50 dark:bg-neutral-800/30"
              >
                <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700 pb-2">
                  <span className="font-extrabold text-xs text-neutral-900 dark:text-white">{dishName}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300">
                    {recipe.categoria}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {recipe.insumos?.map((ins: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-700 dark:text-neutral-300 font-medium">• {ins.insumo}</span>
                      <span className="text-neutral-500 dark:text-neutral-400 font-mono text-[11px]">{ins.cantidad}</span>
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
