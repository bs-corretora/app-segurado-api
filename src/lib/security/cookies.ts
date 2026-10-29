import type { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';

/** Seção 7.1 da especificação. */
export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/v1/auth/refresh';
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

type Sessao = { access_token: string; refresh_token: string; expires_in: number };

export function gravarSessao(res: NextResponse, sessao: Sessao) {
  const secure = getEnv().COOKIE_SECURE;
  res.cookies.set(ACCESS_COOKIE, sessao.access_token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: ACCESS_PATH,
    maxAge: sessao.expires_in,
  });
  res.cookies.set(REFRESH_COOKIE, sessao.refresh_token, {
    httpOnly: true,
    secure,
    sameSite: 'strict',
    path: REFRESH_PATH,
    maxAge: REFRESH_MAX_AGE,
  });
  return res;
}

export function limparSessao(res: NextResponse) {
  const secure = getEnv().COOKIE_SECURE;
  const base = { httpOnly: true, secure, sameSite: 'strict' as const, maxAge: 0 };
  res.cookies.set(ACCESS_COOKIE, '', { ...base, path: ACCESS_PATH });
  res.cookies.set(REFRESH_COOKIE, '', { ...base, path: REFRESH_PATH });
  return res;
}
