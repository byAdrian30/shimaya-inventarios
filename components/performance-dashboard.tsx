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
    const s = data.summary || {};
    const rows = [
      ['--- REPORTE DE RENDIMIENTO Y RENTABILIDAD SHIMAYA RAMEN ---'],
      ['Metodologia', 'Insumos promediados al 50% por dia de ciclo de 2 dias. Calculado desde inicio de despachos.'],
      ['Ventas Periodo Activo Sin IGV (S/)', s.totalVentaSinIgv],
      ['IGV 18% (S/)', s.totalIgv],
      ['Ventas Periodo Activo Con IGV (S/)', s.totalVentaConIgv],
      ['Insumos Consumidos Neto (S/)', s.totalCostoSinIgv],
      ['Utilidad Bruta (S/)', s.totalUtilidadSinIgv],
      ['Margen Promedio (%)', `${s.margenPromedio}%`],
      ['Food Cost Promedio (%)', `${s.foodCostPromedio}%`],
      [],
      ['--- CICLOS DE ABASTECIMIENTO DE ALMACEN (2 DIAS) ---'],
      ['Ciclo', 'Venta Sin IGV (S/)', 'IGV 18% (S/)', 'Venta Con IGV (S/)', 'Pedido Insumos (S/)', 'Promedio Diario 50% (S/)', 'Utilidad (S/)', 'Margen (%)', 'Food Cost (%)'],
      ...(data.cycles || []).map((c: any) => [
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
      ...(data.daily || []).map((d: any) => [
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

      {/* Banner Informativo de Metodología */}
      <div className="hint" style={{ background: '#f0f5fb', borderColor: '#bcd2ec', color: '#1a4971', margin: 0 }}>
        <TrendingUp size={18} />
        <div>
          <strong>Cálculo de Rentabilidad desde el 11 de Octubre (Inicio de Despachos de Almacén)</strong>
          <p style={{ margin: '3px 0 0', fontSize: '12px', opacity: 0.9 }}>
            Cada pedido a almacén abastece un ciclo de 2 días: el costo de insumos se promedia al 50% diario para reflejar la rentabilidad real de ambos días de venta continuos, sin días vacíos.
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas Principales (KPIs) */}
      <div className="stats">
        <section className="stat">
          <div>
            <span>VENTAS PERÍODO ACTIVO</span>
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
            Neto: {soles(s.totalCostoSinIgv || 0)} · Total traído: {soles(s.totalCostoDespachadoSinIgv || 0)}
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
          <span>Detalle Día por Día (Promediado de Ambos Días)</span>
        </button>
      </div>

      {/* VISTA 1: CICLOS DE 2 DÍAS (PEDIDO A ALMACÉN) */}
      {viewMode === 'cycles' && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedCycle ? '1.4fr 1fr' : '1fr', gap: '20px', alignItems: 'start' }}>
          <section className="panel">
            <div className="section-title">
              <div>
                <h2>Rentabilidad por Ciclos de Abastecimiento (2 Días)</h2>
                <p>Cruce directo entre la mercadería traída en cada pedido y las ventas acumuladas del ciclo.</p>
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
                  {(data.cycles || []).map((c: any) => {
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
                  <p>Insumos traídos para abastecer ambos días del ciclo.</p>
                </div>
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
              <h2>Ventas Diarias con Rentabilidad Promediada de Insumos</h2>
              <p>
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
                {(data.daily || []).map((d: any) => (
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
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
