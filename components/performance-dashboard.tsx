'use client';

import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  DollarSign,
  Package,
  Calendar,
  Percent,
  RefreshCw,
  Upload,
  ArrowUpRight,
  ChevronRight,
  ChevronDown,
  Check,
  AlertTriangle,
  LoaderCircle,
  FileSpreadsheet,
  Layers,
  ArrowDownToLine,
  Coins,
  X
} from 'lucide-react';

const soles = (n: number, d = 2) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const pct = (n: number) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + '%';

export default function PerformanceDashboard({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'cycles' | 'daily'>('cycles');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-11');
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploadToast, setUploadToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData(targetMonth?: string, forceSync = false) {
    setLoading(true);
    setError('');
    try {
      const monthToFetch = targetMonth || selectedMonth;
      const url = `/api/admin/performance?month=${encodeURIComponent(monthToFetch)}${forceSync ? '&sync=true' : ''}`;
      const res = await fetch(url, { cache: 'no-store' });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json.error || 'No se pudo cargar el análisis de rendimiento.');
      setData(json);

      const activeMonthId = targetMonth || json.selectedMonth || '2026-11';
      setSelectedMonth(activeMonthId);

      const activeP = (json.periods && json.periods[activeMonthId]) ? json.periods[activeMonthId] : json;
      if (activeP.cycles && activeP.cycles.length > 0) {
        setSelectedCycle(activeP.cycles[0]);
      } else {
        setSelectedCycle(null);
      }
    } catch (e: any) {
      setError(e.message || 'Error al obtener rendimiento.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncIdPos() {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch('/api/admin/performance?sync=true', { cache: 'no-store' });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json.error || 'Error al sincronizar con ID POS');
      setData(json);
      setUploadToast('¡Ventas sincronizadas exitosamente en vivo con ID POS!');
      setTimeout(() => setUploadToast(''), 4500);
    } catch (e: any) {
      setError(e.message || 'Error al conectar con ID POS.');
    } finally {
      setSyncing(false);
    }
  }

  function handleMonthChange(newMonthId: string) {
    setSelectedMonth(newMonthId);
    if (data?.periods && data.periods[newMonthId]) {
      const p = data.periods[newMonthId];
      if (p.cycles && p.cycles.length > 0) {
        setSelectedCycle(p.cycles[0]);
      } else {
        setSelectedCycle(null);
      }
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleExcelUpload(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error('El archivo no contiene hojas válidas.');

      const daily: Record<string, any> = {};
      for (let r = 8; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const total = parseFloat(String(row.getCell(20).value || '0')) || 0;
        const rawDate = row.getCell(32).text || row.getCell(28).text;
        if (!rawDate) continue;
        const parts = rawDate.split('/');
        if (parts.length !== 3) continue;
        const isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        if (!daily[isoDate]) {
          daily[isoDate] = { date: isoDate, ordersCount: 0, ventaSinIgv: 0, igv: 0, ventaConIgv: 0 };
        }
        daily[isoDate].ordersCount++;
        daily[isoDate].ventaSinIgv = Math.round((daily[isoDate].ventaSinIgv + total) * 100) / 100;
        daily[isoDate].igv = Math.round((daily[isoDate].ventaSinIgv * 0.18) * 100) / 100;
        daily[isoDate].ventaConIgv = Math.round((daily[isoDate].ventaSinIgv * 1.18) * 100) / 100;
      }

      const days = Object.keys(daily).sort().map(d => daily[d]);
      if (!days.length) throw new Error('No se encontraron registros de venta en el archivo.');

      const saveRes = await fetch('/api/admin/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'update-sales', days }),
      });
      const saveJson = (await saveRes.json()) as any;
      if (!saveRes.ok) throw new Error(saveJson.error || 'Error al guardar los datos de venta.');

      setUploadToast(`¡Ventas actualizadas con éxito! (${days.length} días procesados)`);
      setTimeout(() => setUploadToast(''), 4000);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Error al procesar el archivo Excel.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const activePeriod = (data?.periods && data.periods[selectedMonth])
    ? data.periods[selectedMonth]
    : { summary: data?.summary, cycles: data?.cycles, daily: data?.daily };

  const s = activePeriod?.summary || data?.summary || {};
  const currentCycles = activePeriod?.cycles || [];
  const currentDaily = activePeriod?.daily || [];
  const availableMonths = data?.availableMonths || [];

  function exportCSV() {
    if (!data) return;
    const rows = [
      ['--- REPORTE DE RENDIMIENTO Y RENTABILIDAD SHIMAYA RAMEN ---'],
      ['Periodo', s.periodName || 'Mensual'],
      ['Rango', s.periodRange || ''],
      ['Metodologia', s.periodDescription || 'Insumos promediados al 50% por dia de ciclo de 2 dias.'],
      ['Ventas Periodo Sin IGV (S/)', s.totalVentaSinIgv],
      ['IGV 18% (S/)', s.totalIgv],
      ['Ventas Periodo Con IGV (S/)', s.totalVentaConIgv],
      ['Insumos Consumidos Neto (S/)', s.totalCostoSinIgv],
      ['Insumos Consumidos Bruto (+IGV) (S/)', s.totalCostoConIgv],
      ['Utilidad Bruta (S/)', s.totalUtilidadSinIgv],
      ['Margen Promedio (%)', `${s.margenPromedio}%`],
      ['Food Cost Promedio (%)', `${s.foodCostPromedio}%`],
      [],
      ['--- CICLOS DE ABASTECIMIENTO DE ALMACEN (2 DIAS) ---'],
      ['Ciclo', 'Venta Sin IGV (S/)', 'IGV 18% (S/)', 'Venta Con IGV (S/)', 'Pedido Insumos (S/)', 'Promedio Diario 50% (S/)', 'Utilidad (S/)', 'Margen (%)', 'Food Cost (%)'],
      ...currentCycles.map((c: any) => [
        `"${c.label}"`,
        c.ventaSinIgv,
        c.igv,
        c.ventaConIgv,
        c.costoSinIgv,
        c.costoPromedioPorDia,
        c.utilidadSinIgv,
        `${c.margenPct}%`,
        `${c.foodCostPct}%`
      ]),
      [],
      ['--- DETALLE DIA POR DIA CON PROMEDIO DE INSUMOS ---'],
      ['Fecha', 'Ciclo', 'Dia en Ciclo', 'Venta Sin IGV (S/)', 'Venta Con IGV (S/)', 'Insumos Promediados 50% (S/)', 'Utilidad Diaria (S/)', 'Margen Dia (%)', 'Food Cost Dia (%)', 'Margen Ciclo 2 Dias (%)'],
      ...currentDaily.map((d: any) => [
        d.date,
        `"${d.cycleLabel}"`,
        `${d.dayInCycle}/2`,
        d.ventaSinIgv,
        d.ventaConIgv,
        d.costoSinIgv,
        d.utilidadSinIgv,
        `${d.margenPct}%`,
        `${d.foodCostPct}%`,
        `${d.cycleMargenPromedio}%`
      ])
    ];
    const csvContent = '\ufeff' + rows.map(r => r.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shimaya-rendimiento-${selectedMonth}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <section className="panel" style={{ padding: '40px', textAlign: 'center' }}>
        <LoaderCircle className="spin" size={28} style={{ margin: '0 auto 14px' }} />
        <p style={{ color: 'var(--muted)' }}>Calculando rentabilidad y cruce de ventas vs insumos…</p>
      </section>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Barra de Acciones Superior Optimizada para Móvil */}
      <div className="perf-header">
        <div className="perf-title-box">
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Análisis de Rendimiento y Rentabilidad</h2>
          <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
            Cruce de ventas diarias (+18% IGV) contra insumos despachados de almacén cada 2 días.
            {data?.lastSyncAt && (
              <span style={{ display: 'inline-block', marginLeft: '8px', color: 'var(--green)', fontWeight: 500 }}>
                · Sincronizado: {new Date(data.lastSyncAt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="perf-actions">
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={e => handleExcelUpload(e.target.files?.[0])}
          />
          {!readOnly && (
            <button
              className="btn"
              disabled={syncing || busy || loading}
              onClick={handleSyncIdPos}
              title="Sincronizar ventas en vivo directamente desde ID POS"
              style={{ background: '#204735', borderColor: '#204735' }}
            >
              <RefreshCw size={15} className={syncing ? 'spin' : ''} />
              <span className="hide-mobile">{syncing ? 'Sincronizando ID POS…' : 'Sincronizar ID POS'}</span>
              <span className="show-mobile">{syncing ? 'Sincronizando…' : 'ID POS'}</span>
            </button>
          )}
          {!readOnly && <button
            className="btn secondary"
            disabled={busy || syncing}
            onClick={() => fileInputRef.current?.click()}
            title="Subir nuevo Excel de ventas diarias"
          >
            <Upload size={15} />
            <span className="hide-mobile">Cargar ventas Excel</span>
            <span className="show-mobile">Subir Excel</span>
          </button>}
          <button className="btn secondary" onClick={exportCSV} title="Descargar reporte en CSV">
            <ArrowDownToLine size={15} />
            <span>Exportar</span>
          </button>
          <button className="icon-btn" onClick={() => loadData()} disabled={busy || loading || syncing} title="Actualizar datos">
            <RefreshCw size={17} />
          </button>
        </div>
      </div>

      {uploadToast && (
        <div className="hint" style={{ background: '#ecf6ec', borderColor: '#b7ddb7', color: '#27592b', margin: 0 }}>
          <Check size={18} />
          <span>{uploadToast}</span>
        </div>
      )}

      {error && (
        <div className="error" style={{ margin: 0 }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Selector de Período / Mes para Rentabilidad */}
      <div
        className="perf-period-bar"
        style={{
          background: '#fff',
          border: '1px solid var(--line)',
          borderRadius: '11px',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} style={{ color: 'var(--green)' }} />
            <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
              Período de Rentabilidad (Por Mes Calendario):
            </strong>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
            {s.periodRange ? `Rango: ${s.periodRange}` : ''} {s.totalDays ? `· ${s.totalDays} días registrados` : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {availableMonths.map((m: any) => {
            const isSelected = selectedMonth === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleMonthChange(m.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  border: isSelected ? '1px solid var(--green)' : '1px solid #dce1d6',
                  background: isSelected ? 'var(--green)' : '#fff',
                  color: isSelected ? '#fff' : '#334133',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 2px 6px rgba(61,101,80,0.22)' : 'none',
                }}
              >
                <span>{m.label}</span>
                {m.isCurrent && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: isSelected ? 'rgba(255,255,255,0.25)' : '#e7f0e5',
                      color: isSelected ? '#fff' : '#2d683b',
                      letterSpacing: '0.3px',
                      textTransform: 'uppercase',
                    }}
                  >
                    Mes Actual
                  </span>
                )}
                {isSelected && <Check size={14} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Banner Informativo de Metodología */}
      <div className="hint" style={{ background: '#f0f5fb', borderColor: '#bcd2ec', color: '#1a4971', margin: 0 }}>
        <TrendingUp size={18} />
        <div>
          <strong>
            {selectedMonth === 'all'
              ? 'Consolidado Histórico Completo de Rentabilidad'
              : `Rentabilidad de ${s.periodName || 'Período'} · Del ${s.periodRange || 'mes'}`}
          </strong>
          <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.9 }}>
            {s.periodDescription ||
              'Cada pedido a almacén abastece un ciclo de 2 días: el costo de insumos se promedia al 50% diario para reflejar la rentabilidad real de ambos días de venta continuos, arrancando desde el primer día del mes.'}
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas Principales (KPIs) */}
      <div className="stats">
        <section className="stat">
          <div>
            <span>VENTAS {s.periodName ? s.periodName.toUpperCase() : 'PERÍODO ACTIVO'}</span>
            <DollarSign size={18} />
          </div>
          <strong>{soles(s.totalVentaConIgv || 0)}</strong>
          <small>
            Sin IGV: {soles(s.totalVentaSinIgv || 0)} · IGV: {soles(s.totalIgv || 0)}
          </small>
        </section>

        <section className="stat">
          <div>
            <span>INSUMOS CONSUMIDOS</span>
            <Package size={18} />
          </div>
          <strong style={{ color: '#ad492d' }}>{soles(s.totalCostoConIgv || 0)}</strong>
          <small>
            Neto: {soles(s.totalCostoSinIgv || 0)} · Total despachado: {soles(s.totalCostoDespachadoSinIgv || 0)}
          </small>
        </section>

        <section className="stat">
          <div>
            <span>UTILIDAD BRUTA</span>
            <Coins size={18} />
          </div>
          <strong style={{ color: '#2b6338' }}>{soles(s.totalUtilidadSinIgv || 0)}</strong>
          <small>Ventas netas menos insumos promediados</small>
        </section>

        <section className="stat">
          <div>
            <span>MARGEN DE RENTABILIDAD</span>
            <TrendingUp size={18} />
          </div>
          <strong style={{ color: '#1f5b33' }}>{pct(s.margenPromedio || 0)}</strong>
          <small>Food Cost promedio: {pct(s.foodCostPromedio || 0)}</small>
        </section>
      </div>

      {/* Selector de Modo de Vista con soporte para celular */}
      <div className="perf-view-selector">
        <button
          className={viewMode === 'cycles' ? 'btn' : 'btn secondary'}
          onClick={() => setViewMode('cycles')}
        >
          <Layers size={15} />
          <span className="hide-mobile">Ciclos de Pedido a Almacén (Cada 2 días)</span>
          <span className="show-mobile">Ciclos (2 días)</span>
        </button>
        <button
          className={viewMode === 'daily' ? 'btn' : 'btn secondary'}
          onClick={() => setViewMode('daily')}
        >
          <Calendar size={15} />
          <span className="hide-mobile">Detalle Día por Día (Promediado de Ambos Días)</span>
          <span className="show-mobile">Día por día</span>
        </button>
      </div>

      {/* VISTA 1: CICLOS DE 2 DÍAS (PEDIDO A ALMACÉN) */}
      {viewMode === 'cycles' && (
        <div className={`perf-cycles-grid ${!selectedCycle ? 'single' : ''}`}>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Rentabilidad por Ciclos de Abastecimiento · {s.periodName || '2 Días'}</h2>
                <p>
                  {s.periodRange ? `Período: ${s.periodRange}. ` : ''}
                  Cruce directo entre mercadería de almacén y ventas acumuladas del ciclo de 2 días.
                </p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>CICLO (2 DÍAS)</th>
                    <th>VENTA SIN IGV</th>
                    <th>IGV (+18%)</th>
                    <th>VENTA CON IGV</th>
                    <th>PEDIDO INSUMOS</th>
                    <th>PROMEDIO DÍA</th>
                    <th>UTILIDAD</th>
                    <th>MARGEN %</th>
                    <th>DETALLE</th>
                  </tr>
                </thead>
                <tbody>
                  {currentCycles.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                        No hay ciclos de abastecimiento registrados para este período.
                      </td>
                    </tr>
                  ) : (
                    currentCycles.map((c: any) => {
                      const isSelected = selectedCycle?.id === c.id;
                      const margin = c.margenPct;
                      const statusClass = margin >= 75 ? 'ok' : margin >= 60 ? 'neutral' : 'low';

                      return (
                        <tr
                          key={c.id}
                          style={{ background: isSelected ? '#f5f9f3' : undefined, cursor: 'pointer' }}
                          onClick={() => setSelectedCycle(c)}
                        >
                          <td data-label="Ciclo">
                            <strong>{c.label}</strong>
                            <small>{c.ordersCount} órdenes {c.isEnCurso && '· En curso'}</small>
                          </td>
                          <td data-label="Venta sin IGV"><strong>{soles(c.ventaSinIgv)}</strong></td>
                          <td data-label="IGV 18%"><span style={{ color: 'var(--muted)' }}>{soles(c.igv)}</span></td>
                          <td data-label="Venta con IGV"><strong>{soles(c.ventaConIgv)}</strong></td>
                          <td data-label="Pedido Insumos" style={{ color: '#ad492d' }}>
                            <strong>{soles(c.costoSinIgv)}</strong>
                            <small>Bruto: {soles(c.costoConIgv)}</small>
                          </td>
                          <td data-label="Promedio Diario">
                            <span style={{ fontSize: '11px', color: '#1a4971', fontWeight: 600 }}>{soles(c.costoPromedioPorDia)} / día</span>
                            <small>50% por día</small>
                          </td>
                          <td data-label="Utilidad Bruta" style={{ color: '#2b6338' }}>
                            <strong>{soles(c.utilidadSinIgv)}</strong>
                          </td>
                          <td data-label="Margen %">
                            <strong style={{ fontSize: '13px' }}>{pct(c.margenPct)}</strong>
                            <small>Food cost: {pct(c.foodCostPct)}</small>
                          </td>
                          <td data-label="Detalle">
                            <button
                              className="text-btn"
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedCycle(c);
                              }}
                            >
                              Ver insumos <ChevronRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Panel Lateral: Insumos traídos de almacén en este ciclo */}
          {selectedCycle && (
            <section className="panel" style={{ position: 'sticky', top: '20px' }}>
              <div className="section-title">
                <div>
                  <h2>Mercadería de Almacén · {selectedCycle.label}</h2>
                  <p>Insumos traídos para abastecer ambos días del ciclo.</p>
                </div>
                <button
                  className="icon-btn"
                  onClick={() => setSelectedCycle(null)}
                  title="Cerrar detalle de insumos"
                  aria-label="Cerrar detalle"
                  style={{ minWidth: '36px', minHeight: '36px' }}
                >
                  <X size={18} />
                </button>
              </div>
              <div style={{ padding: '0 20px 16px', display: 'flex', gap: '14px', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>Venta Ciclo (Sin IGV)</small>
                  <strong>{soles(selectedCycle.ventaSinIgv)}</strong>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>Total Insumos</small>
                  <strong style={{ color: '#ad492d' }}>{soles(selectedCycle.costoSinIgv)}</strong>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>Margen Ciclo</small>
                  <strong style={{ color: '#2b6338' }}>{pct(selectedCycle.margenPct)}</strong>
                </div>
              </div>

              <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '10px 20px' }}>
                {!selectedCycle.topInsumos || selectedCycle.topInsumos.length === 0 ? (
                  <p style={{ color: 'var(--muted)', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>
                    No hubo despachos registrados en este período específico.
                  </p>
                ) : (
                  selectedCycle.topInsumos.map((item: any) => (
                    <div
                      key={item.ingredientId}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 0',
                        borderBottom: '1px solid #f0f2eb',
                        fontSize: '12px',
                      }}
                    >
                      <div>
                        <strong>{item.name}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>
                          {item.quantity} {item.unit} · Costo unitario: {soles(item.unitCostGross)}
                        </small>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong>{soles(item.totalCostGross)}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)', fontSize: '10px' }}>
                          Neto: {soles(item.totalCostNet)}
                        </small>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {/* VISTA 2: DETALLE DÍA POR DÍA (PROMEDIADO DE AMBOS DÍAS) */}
      {viewMode === 'daily' && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Ventas Diarias · {s.periodName || 'Período Activo'}</h2>
              <p>
                {s.periodRange ? `Período: ${s.periodRange}. ` : ''}
                Cada pedido de 2 días se divide al 50% entre ambos días para calcular el margen y food cost real de cada jornada.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FECHA & CICLO</th>
                  <th>ÓRDENES</th>
                  <th>VENTA SIN IGV</th>
                  <th>VENTA CON IGV</th>
                  <th>INSUMOS IMPUTADOS (50%)</th>
                  <th>UTILIDAD DIARIA</th>
                  <th>MARGEN DÍA %</th>
                  <th>FOOD COST DÍA %</th>
                  <th>MARGEN CICLO (2 DÍAS)</th>
                  <th>RECEPCIÓN FÍSICA</th>
                </tr>
              </thead>
              <tbody>
                {currentDaily.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '30px', color: 'var(--muted)' }}>
                      No hay registros diarios de venta para este período.
                    </td>
                  </tr>
                ) : (
                  currentDaily.map((d: any) => (
                    <tr key={d.date}>
                      <td data-label="Fecha">
                        <strong>{d.date}</strong>
                        <small style={{ display: 'block', color: 'var(--muted)' }}>
                          {d.cycleLabel} (Día {d.dayInCycle}/2)
                        </small>
                      </td>
                      <td data-label="Órdenes">{d.ordersCount}</td>
                      <td data-label="Venta sin IGV"><strong>{soles(d.ventaSinIgv)}</strong></td>
                      <td data-label="Venta con IGV"><strong>{soles(d.ventaConIgv)}</strong></td>
                      <td data-label="Insumos Imputados" style={{ color: '#ad492d' }}>
                        <strong>{soles(d.costoSinIgv)}</strong>
                        <small>50% del pedido</small>
                      </td>
                      <td data-label="Utilidad Diaria" style={{ color: '#2b6338' }}>
                        <strong>{soles(d.utilidadSinIgv)}</strong>
                      </td>
                      <td data-label="Margen Día %">
                        <strong style={{ fontSize: '13px' }}>{pct(d.margenPct)}</strong>
                      </td>
                      <td data-label="Food Cost Día %">
                        <span>{pct(d.foodCostPct)}</span>
                      </td>
                      <td data-label="Margen Ciclo (2 días)">
                        <strong style={{ color: '#1a4971' }}>{pct(d.cycleMargenPromedio)}</strong>
                        <small>Promedio período</small>
                      </td>
                      <td data-label="Recepción Física">
                        {d.pedidoFisicoLlegado ? (
                          <span className="status ok" title={`Llegó pedido físico de almacén por ${soles(d.pedidoFisicoMontoNeto)}`}>
                            📦 Llegó pedido: {soles(d.pedidoFisicoMontoNeto)}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>Abastecido por ciclo</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
