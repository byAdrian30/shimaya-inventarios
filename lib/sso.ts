import crypto from 'node:crypto';

export const SSO_SECRET = 'Shimaya_Gastos_Inventarios_Secret_2026';

/**
 * Valida un ticket SSO firmado proveniente de Control de Gastos
 */
export function verifySsoTicket(ticket: string | null | undefined): string | null {
  if (!ticket || typeof ticket !== 'string') return null;
  const parts = ticket.split('.');
  if (parts.length !== 3) return null;
  const [userKey, ts, hmac] = parts;
  const time = parseInt(ts, 10);
  if (isNaN(time)) return null;
  // Válido por 3 minutos (180000ms)
  if (Math.abs(Date.now() - time) > 180000) return null;
  const expectedHmac = crypto.createHmac('sha256', SSO_SECRET).update(`${userKey}:${ts}`).digest('hex');
  try {
    if (crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
      return userKey;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Genera un ticket SSO firmado
 */
export function createSsoTicket(userKey: string): string {
  const cleanKey = (userKey || '').toLowerCase().trim();
  const ts = Date.now().toString();
  const hmac = crypto.createHmac('sha256', SSO_SECRET).update(`${cleanKey}:${ts}`).digest('hex');
  return `${cleanKey}.${ts}.${hmac}`;
}
