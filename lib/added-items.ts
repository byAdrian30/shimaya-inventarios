import { normalize, type State } from './inventory.ts';

export const addedItemsVersion = 'manual-items-2026-10-17-v7-pulpa-mango-unificada';

export function withAddedItems(current: State): State {
  if (current.addedItemsVersion === addedItemsVersion) return current;

  const s = structuredClone(current);
  s.areaItems = s.areaItems || [];

  // Helper para desactivar items por área y expresión regular
  const deactivate = (areaName: string, pattern: RegExp) => {
    s.areaItems!.forEach((a) => {
      if (a.area.toLowerCase() === areaName.toLowerCase() && pattern.test(normalize(a.name))) {
        a.active = false;
      }
    });
  };

  // Helper para agregar o actualizar item en un área
  const addOrUpdate = (
    id: string,
    targetArea: string,
    group: string,
    name: string,
    catId: string,
    refUnit: string
  ) => {
    let existing = s.areaItems!.find((a) => a.id === id);
    if (!existing) {
      existing = s.areaItems!.find((a) => normalize(a.name) === normalize(name) && a.area === targetArea);
    }

    let stock = s.ingredients.find((i) => i.catalogId === catId || i.id === catId);
    if (!stock) {
      stock = {
        id: catId,
        catalogId: catId,
        name,
        category: group,
        unit: refUnit || 'und',
        sourceUnit: refUnit,
        stock: 0,
        minimum: 0,
        configured: true,
        noOrder: false,
      };
      s.ingredients.push(stock);
    }
    if (!stock.unit) stock.unit = refUnit || 'und';
    if (!stock.unitIssue) stock.configured = true;

    const unit = refUnit || stock.sourceUnit || stock.unit || 'und';

    if (existing) {
      existing.id = id;
      existing.area = targetArea;
      existing.group = group || existing.group || 'Abarrotes';
      existing.name = name;
      existing.sourceName = name;
      existing.active = true;
      existing.ingredientId = stock.id;
      existing.referenceUnit = unit;
      existing.linkReviewed = true;
      existing.ingredientOptions = undefined;
    } else {
      s.areaItems!.push({
        id,
        area: targetArea,
        group: group || 'Abarrotes',
        name,
        sourceName: name,
        referenceUnit: unit,
        source: 'AGREGADO POR ADMINISTRACIÓN',
        ingredientId: stock.id,
        active: true,
        linkReviewed: true,
      });
    }
  };

  // =========================================================================
  // 1. MAKIS
  // =========================================================================
  // - Quitar mantequilla
  deactivate('Makis', /mantequilla/);
  // - Quitar polvo kare (pasa a salteado)
  deactivate('Makis', /polvo kare/);
  // - Quitar balde de aceite (pasa a frituras)
  deactivate('Makis', /balde.*aceite|aceite cocinero/);
  // - Quitar col picada (pasa a salteado)
  deactivate('Makis', /col picada/);
  // - Quitar col cocida (pasa a ramen)
  deactivate('Makis', /col cocida/);
  // - Quitar champiñones (pasa a salteado)
  deactivate('Makis', /champinon/);
  // - Quitar mayonesa (solo en salteado)
  deactivate('Makis', /mayonesa/);
  // - Quitar pichicata
  deactivate('Makis', /pichicata/);
  // - Quitar nori picado (solo para salteado y frituras)
  deactivate('Makis', /nori picado/);
  // - Exclusividades de otras estaciones
  deactivate('Makis', /katsu ahumada|yakimeshi|okonomiyaki|pasta wantan/);
  deactivate('Makis', /licor.*arroz|aceite.*ajonjoli|vinagre.*blanco|aceite yakitori/);

  // Agregar / asegurar en Makis:
  addOrUpdate('manual-makis-arroz-personal', 'Makis', 'Abarrotes', 'Arroz de personal', 'manual-stock-arroz-personal', 'kg');
  addOrUpdate('manual-makis-arroz-maki', 'Makis', 'Abarrotes', 'ARROZ MAKI', 'catalog-017', 'kg');
  addOrUpdate('manual-makis-aceite-verde', 'Makis', 'Salsas', 'ACEITE VERDE', 'catalog-004', 'und');
  addOrUpdate('manual-makis-film', 'Makis', 'Empaques', 'FILM PLÁSTICO', 'catalog-103', 'und');
  addOrUpdate('manual-makis-poligras', 'Makis', 'Empaques', 'POLIGRÁS', 'catalog-198', 'rollo');
  addOrUpdate('manual-makis-nori', 'Makis', 'Abarrotes', 'NORI', 'catalog-142', 'paquete');
  addOrUpdate('manual-makis-furikake', 'Makis', 'Abarrotes', 'FURIKAKE', 'catalog-104', 'pote');
  addOrUpdate('manual-makis-crackers-arroz', 'Makis', 'Abarrotes', 'CRACKERS DE ARROZ', 'catalog-084', 'pack');

  // =========================================================================
  // 2. SALTEADO
  // =========================================================================
  // - Quitar nori y furikake de salteado (solo en makis)
  deactivate('Salteado', /^(nori|furikake|nori pack|furikake 100 gr)$/);
  // - Quitar aceite yakitori de salteado (solo en ramen)
  deactivate('Salteado', /aceite yakitori/);
  // - Quitar arroz maki de salteado (pasó a makis)
  deactivate('Salteado', /arroz m.*k/);

  // Agregar / asegurar en Salteado:
  addOrUpdate('manual-salteado-polvo-kare', 'Salteado', 'Abarrotes', 'POLVO KARE', 'catalog-207', 'und');
  addOrUpdate('manual-salteado-col-picada', 'Salteado', 'Verduras', 'COL PICADA', 'catalog-074', 'paquete');
  addOrUpdate('manual-salteado-champinones', 'Salteado', 'Verduras', 'CHAMPIÑONES', 'catalog-035', 'bolsa');
  addOrUpdate('manual-salteado-polvo-pichicata', 'Salteado', 'Abarrotes', 'POLVO PICHICATA', 'catalog-208', 'und');
  addOrUpdate('manual-salteado-licor-arroz', 'Salteado', 'Abarrotes', 'LICOR DE ARROZ', 'catalog-127', 'galon');
  addOrUpdate('manual-salteado-aceite-ajonjoli', 'Salteado', 'Abarrotes', 'ACEITE DE AJONJOLI', 'catalog-003', 'galon');
  addOrUpdate('manual-salteado-vinagre-blanco', 'Salteado', 'Abarrotes', 'VINAGRE BLANCO', 'catalog-300', 'galon');
  addOrUpdate('manual-salteado-salsa-katsu-ahumada', 'Salteado', 'Salsas', 'SALSA KATSU AHUMADA', 'catalog-248', 'bolsa');
  addOrUpdate('manual-salteado-salsa-yakimeshi', 'Salteado', 'Salsas', 'SALSA YAKIMESHI', 'catalog-153', 'pack');
  addOrUpdate('manual-salteado-mantequilla-porcionada', 'Salteado', 'Abarrotes', 'MANTEQUILLA PORCIONADA', 'catalog-021', 'barra');
  addOrUpdate('manual-salteado-salsa-okonomiyaki', 'Salteado', 'Salsas', 'SALSA OKONOMIYAKI', 'catalog-158', 'pack');
  addOrUpdate('manual-salteado-mayonesa', 'Salteado', 'Salsas', 'MAYONESA', 'catalog-037', 'bolsa');
  addOrUpdate('manual-salteado-pasta-wantan', 'Salteado', 'Abarrotes', 'PASTA WANTAN', 'catalog-188', 'kg');
  addOrUpdate('manual-salteado-salsa-ponzu', 'Salteado', 'Salsas', 'SALSA PONZU', 'catalog-257', 'bolsa');
  addOrUpdate('manual-salteado-nori-picado', 'Salteado', 'Abarrotes', 'NORI PICADO', 'catalog-143', 'paquete');

  // =========================================================================
  // 3. FRITURA (FRITURAS)
  // =========================================================================
  // - Quitar pasta wantan (pasó a salteado)
  deactivate('Fritura', /pasta wantan/);
  // - Quitar mayonesa (solo en salteado)
  deactivate('Fritura', /mayonesa/);
  // - Quitar poligras (pasó a makis)
  deactivate('Fritura', /poligras/);
  // - Borrar pasta gyoza siu kao (mismo item con pasta gyoza)
  deactivate('Fritura', /pasta gyoza siu kao|pasta gyosa siu kao/);
  // - Quitar nori o furikake si hubiera
  deactivate('Fritura', /^(nori|furikake)$/);
  // - Quitar polvo kare (solo en salteado)
  deactivate('Fritura', /polvo kare/);
  // - Quitar katsu ahumada (solo en salteado)
  deactivate('Fritura', /katsu ahumada/);
  // - Exclusividades de salteado y ramen
  deactivate('Fritura', /yakimeshi|mantequilla|okonomiyaki/);
  deactivate('Fritura', /licor.*arroz|aceite.*ajonjoli|vinagre.*blanco|aceite yakitori/);

  // Agregar / asegurar en Fritura:
  addOrUpdate('manual-fritura-balde-aceite', 'Fritura', 'Abarrotes', 'BALDE DE ACEITE', 'catalog-019', 'balde');
  addOrUpdate('manual-fritura-polvo-pichicata', 'Fritura', 'Abarrotes', 'POLVO PICHICATA', 'catalog-208', 'und');
  addOrUpdate('manual-fritura-salsa-ponzu', 'Fritura', 'Salsas', 'SALSA PONZU', 'catalog-257', 'bolsa');
  addOrUpdate('manual-fritura-panko', 'Fritura', 'Abarrotes', 'PANKO', 'catalog-228', 'und');
  addOrUpdate('area-salsas-18', 'Fritura', 'Salsas', 'PASTA GYOZA', 'catalog-187', 'paquete');
  addOrUpdate('manual-fritura-nori-picado', 'Fritura', 'Abarrotes', 'NORI PICADO', 'catalog-143', 'paquete');

  // =========================================================================
  // 4. RAMEN
  // =========================================================================
  // - Quitar aceite ajonjoli (solo en salteado)
  deactivate('Ramen', /aceite.*ajonjoli/);
  // - Quitar nori común (solo en makis)
  deactivate('Ramen', /^(nori|nori paqt)$/);
  // - Quitar nori picado (solo en salteado y frituras)
  deactivate('Ramen', /nori picado/);
  // - Borrar PORO duplicado
  deactivate('Ramen', /^poro$/);
  // - Exclusividades de salteado
  deactivate('Ramen', /katsu ahumada|yakimeshi|okonomiyaki|mantequilla|mayonesa|polvo kare/);
  deactivate('Ramen', /licor.*arroz|vinagre.*blanco|pasta wantan|panko/);

  // Renombrar VEGETARIANA a VEGETARIANA SIN SAZONAR
  s.areaItems!.forEach((a) => {
    if (a.area.toLowerCase() === 'ramen' && normalize(a.name) === 'vegetariana') {
      a.name = 'VEGETARIANA SIN SAZONAR';
      a.sourceName = 'VEGETARIANA SIN SAZONAR';
      a.ingredientId = 'catalog-265';
      a.active = true;
    }
  });

  // Agregar / asegurar en Ramen:
  addOrUpdate('manual-ramen-col-cocida', 'Ramen', 'Verduras', 'COL COCIDA', 'catalog-071', 'paquete');
  addOrUpdate('manual-ramen-aceite-yakitori', 'Ramen', 'Salsas', 'ACEITE YAKITORI', 'catalog-005', 'und');
  addOrUpdate('manual-area-ramen-paquete-poro', 'Ramen', 'Verduras', 'PAQUETE DE PORO', 'catalog-180', 'paquete');
  addOrUpdate('manual-ramen-fideo-ramen-kg', 'Ramen', 'Proteinas', 'FIDEO RAMEN X KG', 'catalog-184', 'kg');

  // Asegurar nombres y alias en ingredients
  const vegIng = s.ingredients.find((i) => i.id === 'catalog-265');
  if (vegIng) {
    vegIng.name = 'VEGETARIANA SIN SAZONAR';
    vegIng.aliases = [...new Set([...(vegIng.aliases || '').split(','), 'SALSA VEGETARIANA', 'VEGETARIANA'])].filter(Boolean).join(',');
  }

  const arrozIng = s.ingredients.find((i) => i.id === 'catalog-017');
  if (arrozIng) {
    arrozIng.aliases = [...new Set([...(arrozIng.aliases || '').split(','), 'ARROZ MYK', 'ARROZ MAKI', 'ARROZ JAPONES'])].filter(Boolean).join(',');
  }

  // =========================================================================
  // 5. BARRA: Consolidar PULPA DE MANGO (era fila 22 y 24, dejar uno solo y promediar cantidades)
  // =========================================================================
  s.areaItems!.forEach((a) => {
    if (a.area.toLowerCase() === 'barra' && a.id === 'area-barra-24') {
      a.active = false;
    }
  });

  const mango22 = s.areaItems!.find((a) => a.id === 'area-barra-22');
  if (mango22) {
    mango22.active = true;
    mango22.name = 'PULPA DE MANGO';
    mango22.sourceName = 'PULPA DE MANGO';
    mango22.ingredientId = 'catalog-214';
    mango22.linkReviewed = true;
  }

  const mangoIng = s.ingredients.find((i) => i.id === 'catalog-214');
  if (mangoIng) {
    mangoIng.aliases = [...new Set([...(mangoIng.aliases || '').split(','), 'PULPA DE MANGO', 'PULPA MANGO'])].filter(Boolean).join(',');
  }

  // Si algún pedido histórico o activo incluyó ambas filas de pulpa de mango, promediar las cantidades
  if (s.requests) {
    s.requests.forEach((r) => {
      if (r.area && r.area.toLowerCase() === 'barra' && r.lines) {
        const line22 = r.lines.find((l) => l.itemId === 'area-barra-22');
        const line24 = r.lines.find((l) => l.itemId === 'area-barra-24');

        if (line22 && line24) {
          line22.quantity = Math.round(((Number(line22.quantity || 0) + Number(line24.quantity || 0)) / 2) * 100) / 100;
          if (typeof line22.delivered === 'number' || typeof line24.delivered === 'number') {
            line22.delivered = Math.round(((Number(line22.delivered || 0) + Number(line24.delivered || 0)) / 2) * 100) / 100;
          }
          r.lines = r.lines.filter((l) => l.itemId !== 'area-barra-24');
        } else if (line24 && !line22) {
          line24.itemId = 'area-barra-22';
        }
      }
    });
  }

  // Asegurar otros items previos
  addOrUpdate('manual-area-barra-pulpa-tamarindo', 'Barra', 'Pulpas', 'PULPA DE TAMARINDO', 'catalog-217', 'und');

  s.addedItemsVersion = addedItemsVersion;
  return s;
}
