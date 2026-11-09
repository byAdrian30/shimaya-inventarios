const fs = require('fs');

const catalog = JSON.parse(fs.readFileSync('./data/catalogo_proyeccion.json', 'utf8'));
const inv = JSON.parse(fs.readFileSync('./post_adjustment_inventory_backup.json', 'utf8'));
const dailyDishes = JSON.parse(fs.readFileSync('./data/ventas_platos_diarios_compact.json', 'utf8'));
const movements = inv.state?.movements || [];

// Calculate actual dispatches from inventory (from 2026-10-11 to 2026-11-08: 28 days)
const dispatchSums = {};
movements.filter(m => m.kind === 'despacho' && !m.reversed).forEach(m => {
  (m.lines || []).forEach(l => {
    dispatchSums[l.ingredientId] = (dispatchSums[l.ingredientId] || 0) + Math.abs(l.delta);
  });
});

// Chashu in recipe sales (1829 slices in 36 days -> 91.45 packs -> 35.56 packs / 14 days)
const chashuPacksQuincena = 35.56;

// Tonkotsu:
let tonkotsuMl = 0;
(dailyDishes.dishes || []).forEach(d => {
  const name = d.name.toLowerCase();
  const qty = d.totalQty || 0;
  if (name.includes('ramen')) {
    if (name.includes(' s')) tonkotsuMl += qty * 300;
    else if (name.includes(' m')) tonkotsuMl += qty * 400;
    else if (name.includes(' l')) tonkotsuMl += qty * 500;
    else if (name.includes(' xl')) tonkotsuMl += qty * 600;
    else tonkotsuMl += qty * 400;
  }
});
const tonkotsuBolsasQuincena = parseFloat(((tonkotsuMl / 1000 / 36) * 14).toFixed(2));

let updatedCount = 0;

const updatedCatalog = catalog.map(item => {
  const normName = item.nombre.toLowerCase().trim();
  const ing = inv.state.ingredients.find(i => 
    i.id === item.proid || 
    i.catalogId === item.codigo ||
    i.name.toLowerCase().trim() === normName ||
    (i.aliases && i.aliases.toLowerCase().split(',').some(a => a.trim() === normName || normName.includes(a.trim())))
  );

  let dispatch14d = 0;
  if (ing && dispatchSums[ing.id]) {
    dispatch14d = parseFloat(((dispatchSums[ing.id] / 28) * 14).toFixed(2));
  }

  let finalBase = item.consumoQuincenalBase || 0;

  if (item.nombre.includes('CHASHU')) {
    finalBase = chashuPacksQuincena; // Exact packs from ID POS sales
    updatedCount++;
  } else if (item.nombre.includes('CALDO TONKOTSU')) {
    finalBase = Math.max(finalBase, tonkotsuBolsasQuincena, dispatch14d);
    updatedCount++;
  } else if (dispatch14d > finalBase) {
    finalBase = dispatch14d;
    updatedCount++;
  }

  return {
    ...item,
    consumoQuincenalBase: finalBase,
    consumo14dProyectado: finalBase
  };
});

console.log(`Updated ${updatedCount} items with real consumption rates.`);
fs.writeFileSync('./data/catalogo_proyeccion.json', JSON.stringify(updatedCatalog, null, 2), 'utf8');
console.log('Saved data/catalogo_proyeccion.json successfully!');
