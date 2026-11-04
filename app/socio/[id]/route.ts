import { NextResponse } from 'next/server';
import { AUTH_USERS } from '@/lib/auth-users';
import { verifySsoTicket } from '@/lib/sso';

const SLUG_MAP: Record<string, string> = {
  daniel: 'socio_daniel',
  jhony: 'socio_jhony',
  johnny: 'socio_jhony',
  javier: 'socio_javier',
  riki: 'socio_riki',
  ricky: 'socio_riki',
  adrian: 'admin',
  admin: 'admin',
  administrador: 'admin',
  socio_daniel: 'socio_daniel',
  socio_jhony: 'socio_jhony',
  socio_javier: 'socio_javier',
  socio_riki: 'socio_riki',
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawKey = (id || '').toLowerCase().trim();
  const userKey = SLUG_MAP[rawKey] || (rawKey.startsWith('socio_') ? rawKey : `socio_${rawKey}`);

  const user = AUTH_USERS[userKey] || AUTH_USERS[rawKey];
  const url = new URL(request.url);
  const targetUrl = new URL('/', url.origin);

  if (!user) {
    // Si no coincide con ningún socio o admin registrado, redirige al inicio
    return NextResponse.redirect(targetUrl);
  }

  // Comprobar parámetros de verificación
  const verified = url.searchParams.get('verified');
  const ticket = url.searchParams.get('ticket');
  const requirePass = url.searchParams.get('require_pass');

  // CASO 1: Viene con sesión verificada exitosamente desde Control de Gastos
  if (verified === '1' && ticket) {
    const verifiedUserKey = verifySsoTicket(ticket);
    if (verifiedUserKey) {
      // Sesión en control-gastos confirmada activa
      const cookieVal = AUTH_USERS[userKey] ? userKey : (AUTH_USERS[rawKey] ? rawKey : verifiedUserKey);

      // Limpiar shimaya_cache_v1 en el navegador para evitar que cargue datos del usuario anterior
      const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Accediendo a Inventarios...</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script>
    try {
      localStorage.removeItem('shimaya_cache_v1');
    } catch(e) {}
    window.location.replace('/');
  </script>
</head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#fbfcfb;color:#2c4030;">
  <div style="text-align:center;">
    <p style="font-weight:600;font-size:16px;">Conectando a Inventarios…</p>
    <p style="font-size:13px;color:#687766;">Ingresando como ${user.fullName}...</p>
  </div>
</body>
</html>`;

      const response = new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      });

      response.cookies.set('auth_user', cookieVal, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        httpOnly: false,
      });

      response.cookies.set('__sites_local_auth', cookieVal, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
        httpOnly: false,
      });

      return response;
    }
  }

  // CASO 2: Se determinó que la sesión en Control de Gastos NO está abierta
  if (requirePass === '1' || verified === '0') {
    const loginTarget = new URL('/', url.origin);
    loginTarget.searchParams.set('socio', rawKey);
    loginTarget.searchParams.set('require_pass', '1');
    return NextResponse.redirect(loginTarget);
  }

  // CASO 3: Acceso inicial al enlace. Redirigir a Control de Gastos para validar si la sesión está abierta
  const checkUrl = new URL('https://shimaya-control-gastos.vercel.app/api/auth/verify-session');
  checkUrl.searchParams.set('socio', rawKey);
  checkUrl.searchParams.set('return_to', url.origin + url.pathname);

  return NextResponse.redirect(checkUrl);
}
