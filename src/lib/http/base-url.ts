import type { NextRequest } from 'next/server';
import { getEnv } from '@/lib/env';

/**
 * Endereço público da API, sem barra no fim. Vem de PUBLIC_BASE_URL; sem ela, de
 * RENDER_EXTERNAL_URL (o Render preenche sozinho, pois atrás do proxy dele a requisição chega como
 * 0.0.0.0:10000); fora do Render, do endereço da própria requisição.
 */
export function baseUrl(req: NextRequest): string {
  return (
    getEnv().PUBLIC_BASE_URL ??
    process.env.RENDER_EXTERNAL_URL?.replace(/\/+$/, '') ??
    req.nextUrl.origin
  );
}
