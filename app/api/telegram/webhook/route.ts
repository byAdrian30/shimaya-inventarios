import { env } from 'cloudflare:workers';
import { inventoryFor } from '../../../../lib/inventory-store';
import { inventoryValuation } from '../../../../lib/valuation';

export const dynamic = 'force-dynamic';

function getBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || '7851234567:AAFakeTokenForFallback';
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
  const token = process.env.TELEGRAM_BOT_TOKEN;
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
  const token = process.env.TELEGRAM_BOT_TOKEN;

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

    // Comando: /start o /ayuda
    if (rawText.startsWith('/start') || rawText.startsWith('/help') || cleanText === 'ayuda' || cleanText === 'hola') {
      const welcome = `🍜 *Bot de Inventario - Shimaya Ramen*\n\n` +
        `¡Hola! Estoy conectado en tiempo real a tu sistema de inventarios.\n\n` +
        `*¿Qué puedes preguntarme?*\n` +
        `• Escribe el nombre de cualquier insumo (ej: \`salmon\`, \`fideo\`, \`arroz\`, \`atun\`).\n` +
        `• \`/resumen\` : Resumen general de stock y valorización.\n` +
        `• \`/criticos\` : Insumos que están en quiebre o agotados (stock 0).\n` +
        `• \`/stock <nombre>\` : Consulta directa de stock.\n\n` +
        `_Todos los datos son 100% en vivo desde la base de datos Supabase._`;
      await sendTelegramMessage(chatId, welcome);
      return Response.json({ ok: true });
    }

    // Comando: /resumen
    if (rawText.startsWith('/resumen') || cleanText === 'resumen') {
      const totalIng = ingredients.length;
      const inStock = ingredients.filter(i => i.stock > 0).length;
      const zeroStock = ingredients.filter(i => i.stock <= 0).length;

      // Obtener costos
      let valSummary = '';
      try {
        const costRow = await env.DB!.prepare('SELECT data FROM inventory_costs WHERE owner_id=?').bind(ownerId).first<{ data: string }>();
        const overrides = costRow ? JSON.parse(costRow.data).overrides || [] : [];
        const val = inventoryValuation(inventory.state, overrides);
        valSummary = `\n💰 *Valorización Almacén:* S/ ${val.summary.gross.toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
      } catch (_) {}

      const msg = `📊 *Resumen de Inventario Shimaya*\n` +
        `• Insumos registrados: *${totalIng}*\n` +
        `• Insumos con stock disponible: *${inStock}*\n` +
        `• Insumos en quiebre / agotados (0): *${zeroStock}*` +
        valSummary + `\n\n` +
        `_Revisión de sistema: #${inventory.revision}_`;
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Comando: /criticos
    if (rawText.startsWith('/criticos') || cleanText === 'criticos' || cleanText === 'quiebres') {
      const critical = ingredients.filter(i => i.stock <= 0 && !i.noOrder);
      const list = critical.slice(0, 20).map(i => `• ${i.name} (0 ${i.unit})`).join('\n');
      const msg = `⚠️ *Insumos Críticos / En Quiebre (${critical.length} en total)*\n\n` +
        (list || '¡Excelente! No hay insumos en quiebre.') +
        (critical.length > 20 ? `\n\n_...y ${critical.length - 20} insumos más._` : '');
      await sendTelegramMessage(chatId, msg);
      return Response.json({ ok: true });
    }

    // Consulta de búsqueda de insumo
    let searchTerm = cleanText.replace(/^\/stock\s+/i, '').replace(/^(cuanto|cuanta|stock|precio de|precio)\s+/i, '').trim();
    if (searchTerm.length < 2) {
      await sendTelegramMessage(chatId, `Escribe el nombre de un insumo para buscarlo en el inventario (ej: \`salmon\`, \`caldo tonkotsu\`).`);
      return Response.json({ ok: true });
    }

    // Buscar en ingredientes
    const tokens = searchTerm.split(' ').filter(t => t.length > 2 && !['para', 'con', 'del', 'las', 'los', 'por', 'und', 'de'].includes(t));
    const matches = ingredients.filter(i => {
      const fi = fold(i.name);
      const fa = fold(i.aliases || '');
      if (fi.includes(searchTerm) || fa.includes(searchTerm)) return true;
      if (tokens.length > 0 && tokens.every(t => fi.includes(t) || fa.includes(t))) return true;
      return false;
    });

    if (matches.length === 0) {
      await sendTelegramMessage(chatId, `🔍 No encontré ningún insumo que coincida con "*${rawText}*".\nIntenta con una palabra clave como \`arroz\`, \`fideo\`, \`pollo\` o \`caldo\`.`);
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
