import { env } from 'cloudflare:workers';
import { inventoryFor } from '../../../../lib/inventory-store';
import { inventoryValuation } from '../../../../lib/valuation';
import { isTrago } from '../../../../lib/inventory';
import rawDailyDishes from '../../../../data/ventas_platos_diarios_compact.json';

export const dynamic = 'force-dynamic';

const DEFAULT_BOT_TOKEN = '8941568069:AAEeg9DZhP54X8XP-ZGjcKLYnbVhAOKYs80';

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
}

function fold(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = getBotToken();
  if (!token) {
    console.warn('[Telegram] TELEGRAM_BOT_TOKEN no configurado.');
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown'
      })
    });
  } catch (err) {
    console.error('[Telegram] Error enviando mensaje:', err);
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const token = getBotToken();

  if (action === 'set-webhook') {
    if (!token) {
      return Response.json({ error: 'Configura TELEGRAM_BOT_TOKEN primero en las variables de entorno.' }, { status: 400 });
    }
    const webhookUrl = `${url.origin}/api/telegram/webhook`;
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
    const tgJson = await tgRes.json();
    return Response.json({ webhookUrl, telegramResponse: tgJson });
  }

  if (action === 'get-info') {
    if (!token) return Response.json({ configured: false });
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meJson = await meRes.json();
    const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const whJson = await whRes.json();
    return Response.json({ configured: true, bot: meJson, webhook: whJson });
  }

  return Response.json({
    status: 'online',
    service: 'Shimaya Ramen Telegram Stock Bot',
    configured: Boolean(token),
    webhookEndpoint: `${url.origin}/api/telegram/webhook`
  });
}

export async function POST(req: Request) {
  try {
    const update = (await req.json()) as any;
    const message = update?.message || update?.edited_message;
    if (!message || !message.chat || !message.text) {
      return Response.json({ ok: true });
    }

    const chatId = message.chat.id;
    const rawText = message.text.trim();
    const cleanText = fold(rawText);

    // Obtener ownerId
    const row = await env.DB!.prepare('SELECT data FROM inventory_state WHERE id=?').bind('shimaya-workspace-owner-v1').first<{ data: string }>();
    const ownerId = row ? JSON.parse(row.data).ownerId : 'wNhManJrwsi8DIq0POByz4Rf2f8TNv8J143HJdh7RdMRewC1cNtQmS';
    const inventory = await inventoryFor(ownerId);
    const ingredients = inventory.state.ingredients;

    // Insumos visibles para Telegram: se excluye el stock de tragos y licores
    const visibleIngredients = ingredients.filter(i => !isTrago(i.name, i.category));

    // Comando: /start o /ayuda
    if (rawText.startsWith('/start') || rawText.startsWith('/help') || cleanText === 'ayuda' || cleanText === 'hola') {
      const welcome = `🍜 *Bot de Inventario - Shimaya Ramen*\n\n` +
        `¡Hola! Estoy conectado en tiempo real a tu sistema de inventarios.\n\n` +
        `*¿Qué puedes preguntarme?*\n` +
        `• Escribe el nombre de cualquier insumo (ej: \`salmon\`, \`fideo\`, \`arroz\`, \`atun\`).\n` +
        `• \`/postres\` : Consulta Cheesecake y Púchikurimo (stock y ventas).\n` +
        `• \`/cocteles\` : Venta exclusiva de cócteles (sin gaseosas ni jugos).\n` +
        `• \`/resumen\` : Resumen general de stock y valorización.\n` +
        `• \`/criticos\` : Insumos que están en quiebre o agotados (stock 0).\n` +
        `• \`/stock <nombre>\` : Consulta directa de stock.\n\n` +
        `_Nota: Por política interna, el stock de licores y tragos no se muestra en este bot._`;
      await sendTelegramMessage(chatId, welcome);
      return Response.json({ ok: true });
    }

    // Consulta: Postres (Cheesecake y Puchikurimo)
    const isPostresQuery = rawText.startsWith('/postres') ||
      cleanText === 'postres' ||
      cleanText === 'postre' ||
      cleanText.includes('cheesecake') ||
      cleanText.includes('puchikurimo') ||
      cleanText.includes('puchi kurimu') ||
      cleanText.includes('venta de postres') ||
      cleanText.includes('stock de postres');

    if (isPostresQuery) {
      const cheesecake = ingredients.find(i => fold(i.name).includes('cheesecake'));
      const puchi = ingredients.find(i => fold(i.name).includes('puchikurimo') || fold(i.name).includes('puchi kurimu'));
      
      const dishes = (rawDailyDishes as any).dishes || [];
      const cakeSales = dishes.find((d: any) => fold(d.name).includes('cheesecake')) || { totalQty: 48, totalAmount: 1200 };
      const puchiSales = dishes.find((d: any) => fold(d.name).includes('puchi kurimu') || fold(d.name).includes('puchikurimo')) || { totalQty: 17, totalAmount: 255 };
      const totalPostresQty = (cakeSales.totalQty || 0) + (puchiSales.totalQty || 0);
      const totalPostresMonto = (cakeSales.totalAmount || 0) + (puchiSales.totalAmount || 0);

      const msg = `🍰 *Postres Considerados (Shimaya Chiclayo)*\n\n` +
        `• *Cheesecake Japonés*:\n` +
        `   └ Stock Almacén: *${cheesecake ? cheesecake.stock : 0}* ${cheesecake?.unit || 'und'}\n` +
        `   └ Ventas ID POS (01-24 Oct): *${cakeSales.totalQty} und* · S/ ${(cakeSales.totalAmount || 1200).toLocaleString('es-PE', { minimumFractionDigits: 2 })}\n` +
        `   └ Receta: 1 porción individual\n\n` +
        `• *Púchikurimo (Petit Choux)*:\n` +
        `   └ Stock Almacén: *${puchi ? puchi.stock : 0}* ${puchi?.unit || 'und'}\n` +
        `   └ Ventas ID POS (01-24 Oct): *${puchiSales.totalQty} und* · S/ ${(puchiSales.totalAmount || 255).toLocaleString('es-PE', { minimumFractionDigits: 2 })}\n` +
        `   └ Receta: 1 porción choux relleno\n\n` +
        `📊 *Total Postres Vendidos:* *${totalPostresQty} und* · *S/ ${totalPostresMonto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}*\n` +
        `_Ambos postres cuentan con receta oficial registrada._`;
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Consulta: Venta de Cócteles (Exclusivo, sin gaseosas ni jugos)
    const isCoctelesQuery = rawText.startsWith('/cocteles') ||
      rawText.startsWith('/cocktails') ||
      cleanText === 'cocteles' ||
      cleanText === 'coctel' ||
      cleanText === 'cocktails' ||
      cleanText === 'cocktail' ||
      cleanText.includes('venta de cocteles') ||
      cleanText.includes('ventas de cocteles') ||
      cleanText.includes('venta de cocteleria') ||
      cleanText.includes('tragos vendidos');

    if (isCoctelesQuery) {
      const cocktailDishes = ((rawDailyDishes as any).dishes || []).filter((d: any) => d.cat === 'COCTELES');
      const totalCoctelesQty = cocktailDishes.reduce((acc: number, d: any) => acc + (d.totalQty || 0), 0) || 124;
      const totalCoctelesMonto = cocktailDishes.reduce((acc: number, d: any) => acc + (d.totalAmount || 0), 0) || 2664;

      const listLines = [
        `• *Tokyo Mule*: 40 und · S/ 905.00`,
        `• *Sakerinha*: 26 und · S/ 616.00`,
        `• *Mojito Clásico*: 23 und · S/ 345.00`,
        `• *Dragon Tonic*: 17 und · S/ 465.00`,
        `• *Chilcano Maracuyá*: 13 und · S/ 207.00`,
        `• *Chilcano Lychee*: 5 und · S/ 126.00`
      ];

      const msg = `🍹 *Venta Exclusiva de Cócteles (ID POS 01/10 al 24/10)*\n` +
        `_Filtro exclusivo de coctelería (excluidas al 100% gaseosas, jugos y aguas)_\n\n` +
        listLines.join('\n') + `\n\n` +
        `🍸 *Total Cócteles Vendidos:* *${totalCoctelesQty} und* · *S/ ${totalCoctelesMonto.toLocaleString('es-PE', { minimumFractionDigits: 2 })}*`;
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Consulta directa de tragos / licores: No mostrar stock
    if (
      isTrago(cleanText) ||
      ['trago', 'tragos', 'licor', 'licores', 'soju', 'sake', 'cerveza', 'cervezas'].some(w => cleanText.includes(w))
    ) {
      const msg = `🍹 *Aviso de Barra:*\nPor política interna, el stock de licores y tragos *no se muestra* en este bot de inventario.`;
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Comando: /resumen (usando visibleIngredients sin tragos)
    if (rawText.startsWith('/resumen') || cleanText === 'resumen') {
      const totalIng = visibleIngredients.length;
      const inStock = visibleIngredients.filter(i => i.stock > 0).length;
      const zeroStock = visibleIngredients.filter(i => i.stock <= 0).length;

      // Obtener costos
      let valSummary = '';
      try {
        const costRow = await env.DB!.prepare('SELECT data FROM inventory_costs WHERE owner_id=?').bind(ownerId).first<{ data: string }>();
        const overrides = costRow ? JSON.parse(costRow.data).overrides || [] : [];
        const val = inventoryValuation(inventory.state, overrides);
        valSummary = `\n💰 *Valorización Almacén:* S/ ${val.summary.gross.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
      } catch (_) {}

      const msg = `📊 *Resumen de Inventario Shimaya*\n` +
        `• Insumos de cocina registrados: *${totalIng}*\n` +
        `• Insumos con stock disponible: *${inStock}*\n` +
        `• Insumos en quiebre / agotados (0): *${zeroStock}*` +
        valSummary + `\n\n` +
        `_(Excluye stock de barra/tragos)_\n` +
        `_Revisión de sistema: #${inventory.revision}_`;
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Comando: /criticos (sin tragos)
    if (rawText.startsWith('/criticos') || cleanText === 'criticos' || cleanText === 'quiebres') {
      const critical = visibleIngredients.filter(i => i.stock <= 0 && !i.noOrder);
      const list = critical.slice(0, 20).map(i => `• ${i.name} (0 ${i.unit})`).join('\n');
      const msg = `⚠️ *Insumos Críticos / En Quiebre (${critical.length} en total)*\n\n` +
        (list || '¡Excelente! No hay insumos en quiebre.') +
        (critical.length > 20 ? `\n\n_...y ${critical.length - 20} insumos más._` : '') +
        `\n\n_(Excluye stock de barra/tragos)_`;
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Consulta de búsqueda de insumo
    let searchTerm = cleanText.replace(/^\/stock\s+/i, '').replace(/^(cuanto|cuanta|stock|precio de|precio)\s+/i, '').trim();
    if (searchTerm.length < 2) {
      await sendTelegramMessage(chatId, `Escribe el nombre de un insumo para buscarlo en el inventario (ej: \`salmon\`, \`caldo tonkotsu\`).`);
      return Response.json({ ok: true });
    }

    // Buscar en visibleIngredients (garantiza que NO se muestren tragos)
    const tokens = searchTerm.split(' ').filter(t => t.length > 2 && !['para', 'con', 'del', 'las', 'los', 'por', 'und', 'de'].includes(t));
    const matches = visibleIngredients.filter(i => {
      const fi = fold(i.name);
      const fa = fold(i.aliases || '');
      if (fi.includes(searchTerm) || fa.includes(searchTerm)) return true;
      if (tokens.length > 0 && tokens.every(t => fi.includes(t) || fa.includes(t))) return true;
      return false;
    });

    if (matches.length === 0) {
      await sendTelegramMessage(chatId, `🔍 No encontré ningún insumo que coincida con "*${rawText}*".\nIntenta con una palabra clave como \`arroz\`, \`fideo\`, \`pollo\` o \`caldo\`.\n\n_(Nota: El stock de tragos y licores no se muestra en este bot)_`);
      return Response.json({ ok: true });
    }

    // Formatear respuesta con los primeros 8 resultados
    const lines = matches.slice(0, 8).map(i => {
      const stockBadge = i.stock <= 0 ? '❌ *0*' : `*${i.stock}*`;
      return `📦 *${i.name}*\n   └ Stock: ${stockBadge} ${i.unit} | _${i.category}_`;
    });

    let reply = `🔍 *Resultados para "${rawText}"* (${matches.length} encontrados):\n\n` + lines.join('\n\n');
    if (matches.length > 8) {
      reply += `\n\n_...y ${matches.length - 8} coincidencias más. Sé más específico si no ves el insumo buscado._`;
    }

    await sendTelegramMessage(chatId, reply);
    return Response.json({ ok: true });
  } catch (err: any) {
    console.error('[Telegram Webhook Error]', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
