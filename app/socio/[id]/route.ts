import { NextResponse } from 'next/server';
import { AUTH_USERS, SOCIO_PASSWORD } from '@/lib/auth-users';

const SLUG_MAP: Record<string, string> = {
  daniel: 'socio_daniel',
  jhony: 'socio_jhony',
  johnny: 'socio_jhony',
  javier: 'socio_javier',
  riki: 'socio_riki',
  ricky: 'socio_riki',
};

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawKey = (id || '').toLowerCase().trim();
  const userKey = SLUG_MAP[rawKey] || (rawKey.startsWith('socio_') ? rawKey : `socio_${rawKey}`);

  const user = AUTH_USERS[userKey] || AUTH_USERS[rawKey];
  const url = new URL(request.url);
  const targetUrl = new URL('/', url.origin);

  if (!user) {
    // Si no coincide con ningún socio registrado, redirige al inicio
    return NextResponse.redirect(targetUrl);
  }

  // Validación: Solo pueden entrar directamente si provienen del login de la página de gastos
  const referer = request.headers.get('referer') || '';
  const fromParam = (url.searchParams.get('from') || '').toLowerCase();
  const tokenParam = url.searchParams.get('token') || url.searchParams.get('auth') || '';

  const isFromGastos =
    referer.includes('control-gastos') ||
    referer.includes('shimaya-control-gastos') ||
    referer.includes('localhost:3000') ||
    (fromParam === 'gastos' && tokenParam === SOCIO_PASSWORD) ||
    tokenParam === SOCIO_PASSWORD;

  if (!isFromGastos) {
    // Si no proviene de la página de gastos autorizada, redirige al apartado de cuentas solicitando contraseña
    const loginTarget = new URL('/', url.origin);
    loginTarget.searchParams.set('socio', rawKey);
    loginTarget.searchParams.set('require_pass', '1');
    return NextResponse.redirect(loginTarget);
  }

  const response = NextResponse.redirect(targetUrl);
  const cookieVal = AUTH_USERS[userKey] ? userKey : rawKey;

  // Cookie válida por 1 año
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
