import { NextResponse, type NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';

// CORS da seção 7.3: só as origens de CORS_ALLOWED_ORIGINS, com credenciais.
// O app nativo não manda Origin e não passa por aqui; quem usa é o navegador
// (painel administrativo e página pública).
const CABECALHOS = {
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Max-Age': '600',
};

export function proxy(req: NextRequest) {
  const origem = req.headers.get('origin');
  const permitida = origem !== null && getEnv().CORS_ALLOWED_ORIGINS.includes(origem);

  if (req.method === 'OPTIONS') {
    if (!permitida) return new NextResponse(null, { status: 403 });
    return new NextResponse(null, {
      status: 204,
      headers: { 'Access-Control-Allow-Origin': origem, Vary: 'Origin', ...CABECALHOS },
    });
  }

  const res = NextResponse.next();
  res.headers.append('Vary', 'Origin');
  if (permitida) {
    res.headers.set('Access-Control-Allow-Origin', origem);
    for (const [k, v] of Object.entries(CABECALHOS)) res.headers.set(k, v);
  }
  return res;
}

export const config = {
  matcher: '/api/:path*',
};
