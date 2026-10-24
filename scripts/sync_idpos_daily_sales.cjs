/**
 * Sincronizador Diario ID POS -> Shimaya Inventarios
 * Ejecución programada diaria a las 23:00 (o bajo demanda)
 * Usuario: adrianbarranzuela0108@gmail.com
 * Tienda: SHIMAYA-CHICLAYO (019bb992-2e78-70a8-8b69-179de1edd8fb)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

function request(url, options = {}, postData = null) {
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

    const req = https.request(reqOptions, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const bodyStr = Buffer.concat(data).toString('utf-8');
        try {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: JSON.parse(bodyStr) });
        } catch {
          resolve({ statusCode: res.statusCode, headers: res.headers, body: bodyStr });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    req.end();
  });
}

async function loginIdPos() {
  console.log('[ID POS] Autenticando con adrianbarranzuela0108@gmail.com...');
  const res = await request('https://api.idbi.pe/api/v4/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://pos.idbi.pe',
      'Referer': 'https://pos.idbi.pe/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  }, {
    login: 'adrianbarranzuela0108@gmail.com',
    password: '74156527'
  });

  if (res.statusCode !== 200 || !res.body?.data?.token?.value) {
    throw new Error(`[ID POS] Error de autenticación: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token.value;
}

async function fetchDaySales(token, storeUuid, dateIso) {
  const [y, m, day] = dateIso.split('-').map(Number);
  const nextDt = new Date(Date.UTC(y, m - 1, day + 1));
  const nextIso = nextDt.toISOString().slice(0, 10);

  const from = `${dateIso}T05:00:00.000Z`;
  const to = `${nextIso}T04:59:59.999Z`;

  const params = new URLSearchParams();
  params.append('date[from]', from);
  params.append('date[to]', to);

  const url = `https://api.idbi.pe/api/v6/stores/${storeUuid}/reports/vouchers/kpis?${params.toString()}`;
  const res = await request(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Origin': 'https://pos.idbi.pe',
      'Referer': 'https://pos.idbi.pe/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });

  if (res.statusCode !== 200 || !Array.isArray(res.body)) {
    throw new Error(`[ID POS] Error obteniendo KPIs para ${dateIso}: ${res.statusCode} ${JSON.stringify(res.body)}`);
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

async function syncSales(targetDate = null) {
  // Fecha objetivo (por defecto hoy en horario Perú UTC-5)
  let dateIso = targetDate;
  if (!dateIso) {
    const nowPeru = new Date(Date.now() - 5 * 3600 * 1000);
    dateIso = nowPeru.toISOString().slice(0, 10);
  }

  console.log(`\n======================================================`);
  console.log(`[SYNC ID POS] Iniciando sincronización para fecha: ${dateIso}`);
  console.log(`Hora local: ${new Date().toISOString()}`);

  const storeUuid = '019bb992-2e78-70a8-8b69-179de1edd8fb';
  const token = await loginIdPos();
  const daySales = await fetchDaySales(token, storeUuid, dateIso);
  console.log(`[ID POS] Ventas obtenidas para ${dateIso}:`, daySales);

  // Leer ventas existentes
  const ventasPath = path.resolve(__dirname, '../data/ventas.json');
  let currentVentas = { days: [] };
  if (fs.existsSync(ventasPath)) {
    try {
      currentVentas = JSON.parse(fs.readFileSync(ventasPath, 'utf8'));
    } catch {}
  }

  // Upsert día
  const existingIdx = currentVentas.days.findIndex(d => d.date === dateIso);
  if (existingIdx >= 0) {
    currentVentas.days[existingIdx] = daySales;
  } else {
    currentVentas.days.push(daySales);
  }

  // Ordenar cronológicamente
  currentVentas.days.sort((a, b) => a.date.localeCompare(b.date));
  currentVentas.generatedAt = new Date().toISOString();
  currentVentas.lastSyncDate = dateIso;

  // Guardar en archivo local
  fs.writeFileSync(ventasPath, JSON.stringify(currentVentas, null, 2), 'utf8');
  console.log(`[LOCAL] Guardado en ${ventasPath} (${currentVentas.days.length} días totales).`);

  // Guardar en temp
  const tmpSalesPath = process.platform === 'win32'
    ? path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'shimaya_ventas.json')
    : '/tmp/shimaya_ventas.json';
  fs.writeFileSync(tmpSalesPath, JSON.stringify(currentVentas, null, 2), 'utf8');

  // Enviar a la plataforma en vivo Vercel
  console.log('[PROD] Enviando actualización a https://shimaya-inventarios.vercel.app/api/admin/performance ...');
  try {
    const postRes = await request('https://shimaya-inventarios.vercel.app/api/admin/performance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'auth_user=admin'
      }
    }, {
      type: 'update-sales',
      days: currentVentas.days
    });
    console.log('[PROD] Respuesta de Vercel:', postRes.statusCode, postRes.body);
  } catch (err) {
    console.warn('[PROD] Advertencia enviando a Vercel:', err.message);
  }

  console.log(`[SYNC ID POS] Sincronización completada con éxito.`);
  console.log(`======================================================\n`);
  return daySales;
}

if (require.main === module) {
  const argDate = process.argv[2] || null;
  syncSales(argDate).catch(err => {
    console.error('[SYNC ID POS] Error fatal:', err);
    process.exit(1);
  });
}

module.exports = { syncSales, loginIdPos, fetchDaySales };
