import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import rawCatalog from '../data/catalogo_proyeccion.json';
import type { Ingredient } from './inventory';

export interface PrintMasterOptions {
  locationName?: string;
  responsibleName?: string;
  holidayFactor?: number;
}

function norm(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(n);

/**
 * Genera y descarga el PDF "Imprimir Maestro" con layout ultra optimizado de doble columna.
 * Diseñado específicamente para caber en el mínimo posible de hojas de papel (~108 a 114 insumos por página).
 */
export function generateMasterPdf(
  ingredients: Ingredient[],
  options?: PrintMasterOptions
): void {
  if (!ingredients || ingredients.length === 0) {
    alert('No hay insumos en el inventario para imprimir.');
    return;
  }

  // Construir mapa de proyección indexado por nombre normalizado
  const catMap = new Map<string, any>();
  (rawCatalog as any[]).forEach(item => {
    catMap.set(norm(item.nombre), item);
  });

  // Ordenar alfabéticamente de la A a la Z para agilizar el recorrido físico en almacén
  const sorted = [...ingredients].sort((a, b) =>
    a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  );

  // Mapear cada insumo cruzando su stock actual y la proyección de posible pedido
  const processedRows = sorted.map(i => {
    const normName = norm(i.name);
    let catItem = catMap.get(normName);

    if (!catItem && i.aliases) {
      const aliasList = i.aliases.split(',');
      for (const al of aliasList) {
        const found = catMap.get(norm(al.trim()));
        if (found) {
          catItem = found;
          break;
        }
      }
    }

    if (!catItem) {
      catItem = (rawCatalog as any[]).find(c => {
        const cNorm = norm(c.nombre);
        return cNorm.includes(normName) || normName.includes(cNorm);
      });
    }

    const currentStock = Number.isFinite(i.stock) ? i.stock : 0;
    const unit = i.unit || i.sourceUnit || 'und';

    let sugerenciaPedido = 0;
    if (catItem) {
      const base14d = catItem.consumoQuincenalBase || 0;
      const factor = options?.holidayFactor || 1.05;
      const consumo14d = base14d * factor;
      const dailyCons = consumo14d / 14;
      const buffer = dailyCons * 3;
      const minStock = Math.max(i.minimum || 0, catItem.stockMinimo || 0, buffer);
      const deficit = (consumo14d + minStock) - currentStock;
      sugerenciaPedido = deficit > 0 ? Math.ceil(deficit) : 0;
    } else {
      const minStock = i.minimum || 0;
      const deficit = minStock - currentStock;
      sugerenciaPedido = deficit > 0 ? Math.ceil(deficit) : 0;
    }

    const stockText = currentStock <= 0 ? '0.00' : `${fmt(currentStock)} ${unit}`;
    const pedidoText = sugerenciaPedido > 0 ? `+${sugerenciaPedido} ${unit}` : '-';

    return {
      name: i.name,
      stockText,
      pedidoText,
      isOutOfStock: currentStock <= 0
    };
  });

  // Crear documento A4 vertical
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const now = new Date();
  const dateFormatted = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(now);
  const timeFormatted = new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit'
  }).format(now);

  const ROWS_PER_COL_P1 = 54;
  const ROWS_PER_PAGE_P1 = ROWS_PER_COL_P1 * 2; // 108 insumos en página 1
  const ROWS_PER_COL_OTHER = 57;
  const ROWS_PER_PAGE_OTHER = ROWS_PER_COL_OTHER * 2; // 114 insumos en páginas 2+

  let offset = 0;
  let pageIndex = 1;
  const totalItems = processedRows.length;

  while (offset < totalItems) {
    if (pageIndex > 1) {
      doc.addPage();
    }

    const isFirstPage = pageIndex === 1;
    const itemsThisPageCount = isFirstPage ? ROWS_PER_PAGE_P1 : ROWS_PER_PAGE_OTHER;
    const pageItems = processedRows.slice(offset, offset + itemsThisPageCount);
    offset += itemsThisPageCount;

    const midPoint = Math.ceil(pageItems.length / 2);
    const leftRows = pageItems.slice(0, midPoint);
    const rightRows = pageItems.slice(midPoint);

    // Dibujar Header
    if (isFirstPage) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(182, 55, 42); // Rojo Shimaya
      doc.text('SHIMAYA RAMEN', 6, 8.5);

      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text('— MAESTRO DE INVENTARIO Y CONTEO FÍSICO', 40, 8.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.7);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Local: ${options?.locationName || 'Chiclayo'}  |  Fecha congelamiento: ${dateFormatted} ${timeFormatted}  |  Total insumos: ${totalItems}  |  Responsable: ____________________  |  Firma: ____________________`,
        6,
        12.8
      );

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.line(6, 14.5, 204, 14.5);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(182, 55, 42);
      doc.text('SHIMAYA RAMEN', 6, 7.5);

      doc.setTextColor(71, 85, 105);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.7);
      doc.text(
        `— Maestro de Inventario (Continuación)  |  Fecha: ${dateFormatted}  |  Local: Chiclayo`,
        33,
        7.5
      );

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.25);
      doc.line(6, 9.5, 204, 9.5);
    }

    const startY = isFirstPage ? 16 : 11;

    // Callback para dibujar el cuadro de conteo físico en la columna 3
    const drawBox = (data: any) => {
      if (data.column.index === 3 && data.section === 'body') {
        doc.setDrawColor(148, 163, 184); // Borde gris grafito
        doc.setLineWidth(0.3);
        const cellX = data.cell.x;
        const cellY = data.cell.y;
        const cellW = data.cell.width;
        const cellH = data.cell.height;
        const boxW = Math.min(15, cellW - 2.5);
        const boxH = Math.min(3.4, cellH - 1.2);
        const boxX = cellX + (cellW - boxW) / 2;
        const boxY = cellY + (cellH - boxH) / 2;
        doc.rect(boxX, boxY, boxW, boxH);
      }
    };

    const tableConfig = (rows: typeof leftRows, isLeft: boolean) => ({
      startY,
      margin: { left: isLeft ? 6 : 107, right: isLeft ? 107 : 6 },
      tableWidth: 97,
      theme: 'grid' as const,
      styles: {
        fontSize: 6.2,
        font: 'helvetica' as const,
        cellPadding: { top: 0.6, bottom: 0.6, left: 1, right: 1 },
        lineColor: [226, 232, 240] as [number, number, number],
        lineWidth: 0.15,
        overflow: 'ellipsize' as const,
        textColor: [30, 41, 59] as [number, number, number]
      },
      headStyles: {
        fillColor: [182, 55, 42] as [number, number, number],
        textColor: [255, 255, 255] as [number, number, number],
        fontSize: 6.3,
        fontStyle: 'bold' as const,
        halign: 'center' as const,
        cellPadding: { top: 1, bottom: 1, left: 1, right: 1 }
      },
      columnStyles: {
        0: { cellWidth: 46, fontStyle: 'bold' as const },
        1: { cellWidth: 16, halign: 'right' as const },
        2: { cellWidth: 16, halign: 'right' as const },
        3: { cellWidth: 19, halign: 'center' as const }
      },
      head: [['INSUMO', 'STOCK', 'PEDIDO', 'FÍSICO']],
      body: rows.map(r => [
        r.name,
        r.stockText,
        r.pedidoText,
        ''
      ]),
      didDrawCell: drawBox
    });

    if (leftRows.length > 0) {
      autoTable(doc, tableConfig(leftRows, true));
    }
    if (rightRows.length > 0) {
      autoTable(doc, tableConfig(rightRows, false));
    }

    // Línea vertical punteada central
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(105, startY, 105, 288);
    doc.setLineDashPattern([], 0);

    // Pie de página
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Página ${pageIndex} · Hoja de conteo físico para toma de inventario · Shimaya Ramen`,
      105,
      293,
      { align: 'center' }
    );

    pageIndex++;
  }

  // Nombre de archivo con fecha
  const filenameDate = dateFormatted.replace(/\//g, '-');
  doc.save(`Maestro_Inventario_Shimaya_${filenameDate}.pdf`);
}
