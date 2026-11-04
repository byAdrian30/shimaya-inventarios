/**
 * Sincronizador Automático Diario ID POS -> Shimaya Inventarios
 * Se ejecuta automáticamente todos los días a la 01:00 AM (Hora Perú / 06:00 UTC)
 * en la nube (GitHub Actions / Vercel Cron) sin requerir computadora encendida.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const IDPOS_LOGIN = 'adrianbarranzuela0108@gmail.com';
const IDPOS_PASS = '74156527';
const STORE_UUID = '019bb992-2e78-70a8-8b69-179de1edd8fb';

function req(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const reqOptions = {
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const request = https.request(reqOptions, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const str = buffer.toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(str), buffer });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: str, buffer });
        }
      });
    });

    request.on('error', reject);
    if (postData) {
      request.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    request.end();
  });
}

async function loginIdPos() {
  console.log(`[1/4] Autenticando con ID POS (${IDPOS_LOGIN})...`);
  const res = await req('https://api.idbi.pe/api/v4/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pos.idbi.pe',
      'Referer': 'https://pos.idbi.pe/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }, {
    login: IDPOS_LOGIN,
    password: IDPOS_PASS
  });

  if (res.statusCode !== 200 || !res.body?.data?.token?.value) {
    throw new Error(`[ID POS] Error de autenticación: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token.value;
}

async function fetchDaySales(token, dateIso) {
  const [y, m, day] = dateIso.split('-').map(Number);
  const nextDt = new Date(Date.UTC(y, m - 1, day + 1));
  const nextIso = nextDt.toISOString().slice(0, 10);

  const from = `${dateIso}T05:00:00.000Z`;
  const to = `${nextIso}T04:59:59.999Z`;

  const url = `https://api.idbi.pe/api/v6/stores/${STORE_UUID}/reports/vouchers/kpis?date[from]=${encodeURIComponent(from)}&date[to]=${encodeURIComponent(to)}`;
  const res = await req(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://pos.idbi.pe',
      'Referer': 'https://pos.idbi.pe/',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (res.statusCode !== 200 || !Array.isArray(res.body)) {
    throw new Error(`[ID POS] Error en KPIs para ${dateIso}: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }

  let totalVentaConIgv = 0;
  let totalOrders = 0;
  for (const item of res.body) {
    if (item.type === 'NOTA DE CREDITO') {
      const amt = item.amounts?.find(a => a.currency === 'PEN')?.total || 0;
      totalVentaConIgv -= amt;
    } else {
      const amt = item.amounts?.find(a => a.currency === 'PEN')?.total || 0;
      totalVentaConIgv += amt;
      totalOrders += item.quantity || 0;
    }
  }

  totalVentaConIgv = Math.round(totalVentaConIgv * 100) / 100;
  const ventaSinIgv = Math.round((totalVentaConIgv / 1.18) * 100) / 100;
  const igv = Math.round((totalVentaConIgv - ventaSinIgv) * 100) / 100;

  return {
    date: dateIso,
    ordersCount: totalOrders,
    ventaSinIgv,
    igv,
    ventaConIgv: totalVentaConIgv
  };
}

async function fetchDayDishes(token, dateIso) {
  const [y, m, day] = dateIso.split('-').map(Number);
  const nextDt = new Date(Date.UTC(y, m - 1, day + 1));
  const nextIso = nextDt.toISOString().slice(0, 10);

  const from = `${dateIso}T05:00:00.000Z`;
  const to = `${nextIso}T04:59:59.999Z`;

  const url = `https://api.idbi.pe/api/v6/stores/${STORE_UUID}/reports/gross-detailed-sales/export?date[from]=${encodeURIComponent(from)}&date[to]=${encodeURIComponent(to)}`;
  const res = await req(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://pos.idbi.pe'
    }
  });

  const exportUrl = res.body?.data?.link;
  if (!exportUrl) return null;

  const download = await req(exportUrl);
  if (download.statusCode !== 200 || !download.buffer) return null;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(download.buffer);
  const ws = wb.worksheets[0];

  const itemsMap = new Map();
  let totalAmount = 0;
  let totalPlatos = 0;

  for (let r = 10; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    let cat = String(row.getCell(1).value || '').trim();
    const sku = String(row.getCell(3).value || '').trim();
    const name = String(row.getCell(4).value || '').trim();
    const qty = Number(row.getCell(15).value) || 0;
    const amount = Number(row.getCell(18).value) || 0;

    if (!name || qty <= 0) continue;

    const uName = name.toUpperCase();
    if (uName.includes('CHEESECAKE') || uName.includes('PUCHI KURIMU') || uName.includes('CREMA VOLTEADA') || uName.includes('HELADO') || uName.includes('POSTRE')) {
      cat = 'POSTRES';
    } else if (uName.includes('MOJITO') || uName.includes('CHILCANO') || uName.includes('SAKERINHA') || uName.includes('SAKHERINHA') || uName.includes('TOKYO MULE') || uName.includes('DRAGON TONIC') || uName.includes('GIN ') || uName.includes('PISCO') || uName.includes('COCTEL')) {
      cat = 'COCTELES';
    }

    totalAmount += amount;
    totalPlatos += qty;

    const key = sku ? `${sku}__${name}` : name;
    if (!itemsMap.has(key)) {
      itemsMap.set(key, { name, cat, qty: 0, sku });
    }
    itemsMap.get(key).qty += qty;
  }

  const parts = dateIso.split('-');
  const dateFormatted = `${parts[2]}/${parts[1]}/${parts[0]}`;

  return {
    date: dateIso,
    dateFormatted,
    totalPlatos,
    totalAmount: Math.round(totalAmount * 100) / 100,
    items: [...itemsMap.values()].sort((a, b) => b.qty - a.qty)
  };
}

async function runCronSync(targetDate = null) {
  console.log(`==================================================================`);
  console.log(`[CRON ID POS] Sincronización Automática Diaria (1:00 AM Perú)`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  let dateIso = targetDate;
  if (!dateIso) {
    // 1:00 AM hora de Perú: sincroniza el día anterior completo
    const nowPeru = new Date(Date.now() - 5 * 3600 * 1000);
    const yesterday = new Date(nowPeru.getTime() - 24 * 3600 * 1000);
    dateIso = yesterday.toISOString().slice(0, 10);
  }

  console.log(`[CRON ID POS] Procesando fecha de ayer: ${dateIso}`);
  const token = await loginIdPos();

  // 1. Obtener ventas del día
  console.log(`[2/4] Consultando KPIs de ventas en ID POS para ${dateIso}...`);
  const sales = await fetchDaySales(token, dateIso);
  console.log(`[ID POS] Ventas obtenidas: ${sales.ordersCount} órdenes | Total S/ ${sales.ventaConIgv.toFixed(2)}`);

  // 2. Actualizar data/ventas.json
  const ventasPath = path.resolve(__dirname, '../data/ventas.json');
  let currentVentas = { days: [] };
  if (fs.existsSync(ventasPath)) {
    try {
      currentVentas = JSON.parse(fs.readFileSync(ventasPath, 'utf8'));
    } catch {}
  }

  const existingIdx = currentVentas.days.findIndex(d => d.date === dateIso);
  if (existingIdx >= 0) {
    currentVentas.days[existingIdx] = sales;
  } else {
    currentVentas.days.push(sales);
  }
  currentVentas.days.sort((a, b) => a.date.localeCompare(b.date));
  currentVentas.generatedAt = new Date().toISOString();
  currentVentas.lastSyncDate = dateIso;
  currentVentas.totalDays = currentVentas.days.length;

  fs.writeFileSync(ventasPath, JSON.stringify(currentVentas, null, 2), 'utf8');
  console.log(`[3/4] data/ventas.json actualizado (${currentVentas.days.length} días totales).`);

  // 3. Obtener y actualizar platos vendidos del día
  console.log(`[4/4] Consultando reporte detallado de platos vendidos para ${dateIso}...`);
  try {
    const dayDishes = await fetchDayDishes(token, dateIso);
    if (dayDishes && dayDishes.items?.length > 0) {
      const compactPath = path.resolve(__dirname, '../data/ventas_platos_diarios_compact.json');
      if (fs.existsSync(compactPath)) {
        const compact = JSON.parse(fs.readFileSync(compactPath, 'utf8'));
        const dayIdx = (compact.days || []).findIndex(d => d.date === dateIso);
        if (dayIdx >= 0) {
          compact.days[dayIdx] = dayDishes;
        } else {
          compact.days.push(dayDishes);
        }
        compact.days.sort((a, b) => a.date.localeCompare(b.date));

        // Reconstruir dishes agregados
        const dishesMap = new Map();
        compact.days.forEach(day => {
          (day.items || []).forEach(i => {
            const key = i.sku ? `${i.sku}__${i.name}` : i.name;
            if (!dishesMap.has(key)) {
              dishesMap.set(key, { name: i.name, sku: i.sku, cat: i.cat, totalQty: 0, totalAmount: 0, daily: {} });
            }
            const d = dishesMap.get(key);
            d.totalQty += i.qty;
            d.daily[day.date] = (d.daily[day.date] || 0) + i.qty;
          });
        });

        compact.dishes = [...dishesMap.values()].sort((a, b) => b.totalQty - a.totalQty);
        compact.updatedAt = new Date().toISOString();
        compact.dateRange = {
          from: compact.days[0].date,
          to: compact.days[compact.days.length - 1].date
        };
        compact.grandTotalPlatos = compact.days.reduce((s, d) => s + (d.totalPlatos || 0), 0);
        compact.grandTotalAmount = Math.round(compact.days.reduce((s, d) => s + (d.totalAmount || 0), 0) * 100) / 100;

        fs.writeFileSync(compactPath, JSON.stringify(compact), 'utf8');
        console.log(`[4/4] data/ventas_platos_diarios_compact.json actualizado con ${dayDishes.totalPlatos} platos del día.`);
      }
    }
  } catch (err) {
    console.warn(`[AVISO] No se pudo descargar detalle de platos (se preservan ventas generales):`, err.message);
  }

  console.log(`✅ Sincronización completada exitosamente para ${dateIso}.`);
  console.log(`==================================================================\n`);
  return sales;
}

if (require.main === module) {
  const target = process.argv[2] || null;
  runCronSync(target).catch(err => {
    console.error('[CRON ID POS] Error fatal:', err);
    process.exit(1);
  });
}

module.exports = { runCronSync, loginIdPos, fetchDaySales, fetchDayDishes };
