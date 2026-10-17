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
  Coins
} from 'lucide-react';

const soles = (n: number, d = 2) =>
  'S/ ' + new Intl.NumberFormat('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

const pct = (n: number) =>
  new Intl.NumberFormat('es-PE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + '%';

export default function PerformanceDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState<'cycles' | 'daily'>('cycles');
  const [selectedCycle, setSelectedCycle] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [uploadToast, setUploadToast] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadData() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/performance', { cache: 'no-store' });
      const json = (await res.json()) as any;
      if (!res.ok) throw new Error(json.error || 'No se pudo cargar el análisis de rendimiento.');
      setData(json);
      if (json.cycles && json.cycles.length > 0 && !selectedCycle) {
        setSelectedCycle(json.cycles[0]);
      }
    } catch (e: any) {
      setError(e.message || 'Error al obtener rendimiento.');
    } finally {
      setLoading(false);
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

  function exportCSV() {
    if (!data) return;
    const rows = [
      ['Ciclo / Fecha', 'Venta Sin IGV (S/)', 'IGV 18% (S/)', 'Venta Con IGV (S/)', 'Costo Insumos Sin IGV (S/)', 'Costo Insumos Con IGV (S/)', 'Utilidad Bruta (S/)', 'Margen (%)', 'Food Cost (%)'],
      ...data.cycles.map((c: any) => [
        `"${c.label}"`,
        c.ventaSinIgv,
        c.igv,
        c.ventaConIgv,
        c.costoSinIgv,
        c.costoConIgv,
        c.utilidadSinIgv,
        `${c.margenPct}%`,
        `${c.foodCostPct}%`
      ])
    ];
    const csvContent = '\ufeff' + rows.map(r => r.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shimaya-rendimiento-rentabilidad-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const s = data?.summary || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Barra de Acciones Superior */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 600 }}>Análisis de Rendimiento y Rentabilidad</h2>
          <p style={{ color: 'var(--muted)', fontSize: '12px', marginTop: '4px' }}>
            Cruce de ventas diarias (+18% IGV) contra insumos despachados de almacén cada 2 días.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input
            type="file"
            ref={fileInputRef}
            accept=".xlsx"
            style={{ display: 'none' }}
            onChange={e => handleExcelUpload(e.target.files?.[0])}
          />
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            title="Subir nuevo Excel de ventas diarias"
          >
            <Upload size={15} />
            <span>Cargar ventas Excel</span>
          </button>
          <button className="btn secondary" onClick={exportCSV} title="Descargar reporte en CSV">
            <ArrowDownToLine size={15} />
            <span>Exportar</span>
          </button>
          <button className="icon-btn" onClick={loadData} disabled={busy || loading} title="Actualizar datos">
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

      {/* Tarjetas de Métricas Principales (KPIs) */}
      <div className="stats">
        <section className="stat">
          <div>
            <span>VENTAS CON IGV</span>
            <DollarSign size={18} />
          </div>
          <strong>{soles(s.totalVentaConIgv || 0)}</strong>
          <small>
            Sin IGV: {soles(s.totalVentaSinIgv || 0)} · IGV: {soles(s.totalIgv || 0)}
          </small>
        </section>

        <section className="stat">
          <div>
            <span>COSTO DE INSUMOS</span>
            <Package size={18} />
          </div>
          <strong style={{ color: '#ad492d' }}>{soles(s.totalCostoConIgv || 0)}</strong>
          <small>
            Neto: {soles(s.totalCostoSinIgv || 0)} · Pedidos a almacén
          </small>
        </section>

        <section className="stat">
          <div>
            <span>UTILIDAD BRUTA</span>
            <Coins size={18} />
          </div>
          <strong style={{ color: '#2b6338' }}>{soles(s.totalUtilidadSinIgv || 0)}</strong>
          <small>Margen neto de ventas menos insumos</small>
        </section>

        <section className="stat">
          <div>
            <span>MARGEN DE RENTABILIDAD</span>
            <TrendingUp size={18} />
          </div>
          <strong style={{ color: '#1f5b33' }}>{pct(s.margenPromedio || 0)}</strong>
          <small>Food Cost insumos: {pct(s.foodCostPromedio || 0)}</small>
        </section>
      </div>

      {/* Selector de Modo de Vista */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--line)', paddingBottom: '12px' }}>
        <button
          className={viewMode === 'cycles' ? 'btn' : 'btn secondary'}
          onClick={() => setViewMode('cycles')}
          style={{ fontSize: '12px' }}
        >
          <Layers size={15} />
          <span>Ciclos de Pedido a Almacén (Cada 2 días)</span>
        </button>
        <button
          className={viewMode === 'daily' ? 'btn' : 'btn secondary'}
          onClick={() => setViewMode('daily')}
          style={{ fontSize: '12px' }}
        >
          <Calendar size={15} />
          <span>Detalle Día por Día</span>
        </button>
      </div>

      {/* VISTA 1: CICLOS DE 2 DÍAS (PEDIDO A ALMACÉN) */}
      {viewMode === 'cycles' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedCycle ? '1.4fr 1fr' : '1fr', gap: '20px', alignItems: 'start' }}>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Rentabilidad por Ciclo de 2 Días</h2>
                <p>Cruce directo entre la mercadería que se trae de almacén y las ventas de ese período.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PERÍODO (2 DÍAS)</th>
                    <th>VENTA SIN IGV</th>
                    <th>IGV (+18%)</th>
                    <th>VENTA CON IGV</th>
                    <th>COSTO INSUMOS</th>
                    <th>UTILIDAD</th>
                    <th>MARGEN %</th>
                    <th>ESTADO</th>
                    <th>DETALLE</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.cycles || []).map((c: any) => {
                    const isSelected = selectedCycle?.id === c.id;
                    const margin = c.margenPct;
                    const statusClass = margin >= 75 ? 'ok' : margin >= 60 ? 'neutral' : 'low';
                    const statusText = margin >= 75 ? 'Excelente' : margin >= 60 ? 'Saludable' : 'Por revisar';

                    return (
                      <tr
                        key={c.id}
                        style={{ background: isSelected ? '#f5f9f3' : undefined, cursor: 'pointer' }}
                        onClick={() => setSelectedCycle(c)}
                      >
                        <td data-label="Período">
                          <strong>{c.label}</strong>
                          <small>{c.ordersCount} órdenes</small>
                        </td>
                        <td data-label="Venta sin IGV"><strong>{soles(c.ventaSinIgv)}</strong></td>
                        <td data-label="IGV 18%"><span style={{ color: 'var(--muted)' }}>{soles(c.igv)}</span></td>
                        <td data-label="Venta con IGV"><strong>{soles(c.ventaConIgv)}</strong></td>
                        <td data-label="Costo Insumos" style={{ color: '#ad492d' }}>
                          <strong>{soles(c.costoConIgv)}</strong>
                          <small>Neto: {soles(c.costoSinIgv)}</small>
                        </td>
                        <td data-label="Utilidad Bruta" style={{ color: '#2b6338' }}>
                          <strong>{soles(c.utilidadSinIgv)}</strong>
                        </td>
                        <td data-label="Margen %">
                          <strong style={{ fontSize: '13px' }}>{pct(c.margenPct)}</strong>
                          <small>Food cost: {pct(c.foodCostPct)}</small>
                        </td>
                        <td data-label="Estado">
                          <span className={`status ${statusClass}`}>{statusText}</span>
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
                  })}
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
                  <p>Insumos pedidos y despachados para este ciclo de 2 días.</p>
                </div>
              </div>
              <div style={{ padding: '0 20px 16px', display: 'flex', gap: '14px', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>Venta Ciclo (Sin IGV)</small>
                  <strong>{soles(selectedCycle.ventaSinIgv)}</strong>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>Costo Insumos</small>
                  <strong style={{ color: '#ad492d' }}>{soles(selectedCycle.costoConIgv)}</strong>
                </div>
                <div>
                  <small style={{ color: 'var(--muted)', display: 'block' }}>Margen</small>
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

      {/* VISTA 2: DETALLE DÍA POR DÍA */}
      {viewMode === 'daily' && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>Ventas Diarias vs Consumo Diario de Insumos</h2>
              <p>Desglose completo por día de venta, cálculo de IGV y costo de insumos aplicados.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>FECHA</th>
                  <th>ÓRDENES</th>
                  <th>VENTA SIN IGV</th>
                  <th>IGV (18%)</th>
                  <th>VENTA CON IGV</th>
                  <th>COSTO DESPACHOS</th>
                  <th>UTILIDAD BRUTA</th>
                  <th>MARGEN %</th>
                  <th>RATIO FOOD COST</th>
                </tr>
              </thead>
              <tbody>
                {(data.daily || []).map((d: any) => (
                  <tr key={d.date}>
                    <td data-label="Fecha">
                      <strong>{d.date}</strong>
                    </td>
                    <td data-label="Órdenes">{d.ordersCount}</td>
                    <td data-label="Venta sin IGV"><strong>{soles(d.ventaSinIgv)}</strong></td>
                    <td data-label="IGV 18%"><span style={{ color: 'var(--muted)' }}>{soles(d.igv)}</span></td>
                    <td data-label="Venta con IGV"><strong>{soles(d.ventaConIgv)}</strong></td>
                    <td data-label="Costo Insumos" style={{ color: d.costoConIgv > 0 ? '#ad492d' : 'var(--muted)' }}>
                      <strong>{d.costoConIgv > 0 ? soles(d.costoConIgv) : '—'}</strong>
                      {d.costoSinIgv > 0 && <small>Neto: {soles(d.costoSinIgv)}</small>}
                    </td>
                    <td data-label="Utilidad Bruta" style={{ color: '#2b6338' }}>
                      <strong>{soles(d.utilidadSinIgv)}</strong>
                    </td>
                    <td data-label="Margen %">
                      <strong>{pct(d.margenPct)}</strong>
                    </td>
                    <td data-label="Food Cost">
                      <span>{d.costoSinIgv > 0 ? pct(d.foodCostPct) : '0%'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
