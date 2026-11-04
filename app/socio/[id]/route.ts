import { NextResponse } from 'next/server';
import { AUTH_USERS } from '@/lib/auth-users';

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
