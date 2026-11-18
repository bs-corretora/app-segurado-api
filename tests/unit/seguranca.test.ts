import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE, tokensDoCorpo } from '@/lib/security/cookies';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { erro, erroValidacao, ok } from '@/lib/api-response';
import { cadastroSchema } from '@/lib/schemas/conta';

const ENV_BASE = { SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 'k' };

/** Recarrega o módulo de ambiente (ele guarda o resultado em cache) com as variáveis dadas. */
async function carregarEnv(extra: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries({ ...ENV_BASE, ...extra })) vi.stubEnv(k, v);
  return import('@/lib/env');
}

/** O cookies.ts importa o env; precisa ser carregado depois do stub, no mesmo registro de módulos. */
async function carregarCookies(extra: Record<string, string>) {
  await carregarEnv(extra);
  return import('@/lib/security/cookies');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('RNF-03 CORS allowlist', () => {
  it('RNF-03: recusa "*" em CORS_ALLOWED_ORIGINS', async () => {
    const { getEnv } = await carregarEnv({ CORS_ALLOWED_ORIGINS: '*' });
    expect(() => getEnv()).toThrow(/CORS_ALLOWED_ORIGINS/);
  });
  it('RNF-03: recusa "*" no meio da lista', async () => {
    const { getEnv } = await carregarEnv({ CORS_ALLOWED_ORIGINS: 'https://a.com, *' });
    expect(() => getEnv()).toThrow();
  });
  it('RNF-03: aceita lista de origens e remove espaços', async () => {
    const { getEnv } = await carregarEnv({ CORS_ALLOWED_ORIGINS: 'https://a.com, https://b.com' });
    expect(getEnv().CORS_ALLOWED_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
  it('RNF-03: sem CORS_ALLOWED_ORIGINS a allowlist é vazia', async () => {
    const { getEnv } = await carregarEnv({});
    expect(getEnv().CORS_ALLOWED_ORIGINS).toEqual([]);
  });
});

describe('RNF-01 cookies', () => {
  const sessao = { access_token: 'AAA', refresh_token: 'RRR', expires_in: 3600 };

  it('RNF-01: cookies de sessão são HttpOnly, Secure e SameSite=Strict', async () => {
    const m = await carregarCookies({});
    const res = m.gravarSessao(NextResponse.json({}), sessao);
    for (const nome of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      const c = res.cookies.get(nome);
      expect(c?.httpOnly).toBe(true);
      expect(c?.secure).toBe(true);
      expect(c?.sameSite).toBe('strict');
    }
  });
  it('RNF-01: refresh_token só trafega na rota de refresh, por 30 dias', async () => {
    const m = await carregarCookies({});
    const res = m.gravarSessao(NextResponse.json({}), sessao);
    expect(res.cookies.get(REFRESH_COOKIE)?.path).toBe('/api/v1/auth/refresh');
    expect(res.cookies.get(REFRESH_COOKIE)?.maxAge).toBe(60 * 60 * 24 * 30);
    expect(res.cookies.get(ACCESS_COOKIE)?.path).toBe('/api');
    expect(res.cookies.get(ACCESS_COOKIE)?.maxAge).toBe(3600);
  });
  it('RNF-01: COOKIE_SECURE=false só desliga o Secure (dev local)', async () => {
    const m = await carregarCookies({ COOKIE_SECURE: 'false' });
    const res = m.gravarSessao(NextResponse.json({}), sessao);
    expect(res.cookies.get(ACCESS_COOKIE)?.secure).toBe(false);
    expect(res.cookies.get(ACCESS_COOKIE)?.httpOnly).toBe(true);
    expect(res.cookies.get(ACCESS_COOKIE)?.sameSite).toBe('strict');
  });
  it('RNF-01: logout expira os dois cookies mantendo as flags', async () => {
    const m = await carregarCookies({});
    const res = m.limparSessao(NextResponse.json({}));
    for (const nome of [ACCESS_COOKIE, REFRESH_COOKIE]) {
      const c = res.cookies.get(nome);
      expect(c?.value).toBe('');
      expect(c?.maxAge).toBe(0);
      expect(c?.httpOnly).toBe(true);
      expect(c?.sameSite).toBe('strict');
    }
  });
  it('RNF-01: tokens também vão no corpo, expires_at nulo quando ausente', () => {
    expect(tokensDoCorpo(sessao)).toEqual({
      access_token: 'AAA',
      refresh_token: 'RRR',
      expires_in: 3600,
      expires_at: null,
    });
  });
});

describe('RNF-02 rate limit', () => {
  const chave = (s: string) => `${s}-${Math.random()}`;

  it('RNF-02: login bloqueia na 6ª tentativa com 429 e Retry-After', async () => {
    const k = chave('login');
    for (let i = 0; i < 5; i++) expect(await limitar('login', k)).toBeNull();
    const res = await limitar('login', k);
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
    expect(await res?.json()).toMatchObject({ status: 429, erro: 'LIMITE_EXCEDIDO' });
  });
  it('RNF-02: cadastro permite 3 por minuto', async () => {
    const k = chave('cad');
    for (let i = 0; i < 3; i++) expect(await limitar('cadastro', k)).toBeNull();
    expect((await limitar('cadastro', k))?.status).toBe(429);
  });
  it('RNF-02: o limite é por chave, outro IP não é afetado', async () => {
    const a = chave('a');
    for (let i = 0; i < 5; i++) await limitar('login', a);
    expect((await limitar('login', a))?.status).toBe(429);
    expect(await limitar('login', chave('b'))).toBeNull();
  });
  it('RNF-02: usuário autenticado permite 100 por minuto', async () => {
    const k = chave('u');
    for (let i = 0; i < 100; i++) expect(await limitar('usuario', k)).toBeNull();
    expect((await limitar('usuario', k))?.status).toBe(429);
  });
  it('RNF-02: o contador zera depois da janela de 60 s', async () => {
    const k = chave('t');
    for (let i = 0; i < 5; i++) await limitar('login', k);
    expect((await limitar('login', k))?.status).toBe(429);
    vi.useFakeTimers({ now: Date.now() + 61_000 });
    try {
      expect(await limitar('login', k)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it('RNF-02: o IP vem do último valor do x-forwarded-for (não forjável)', () => {
    const req = (h: Record<string, string>) => ({ headers: new Headers(h) }) as unknown as NextRequest;
    expect(ipDe(req({ 'x-forwarded-for': '6.6.6.6, 10.0.0.1, 203.0.113.9' }))).toBe('203.0.113.9');
    expect(ipDe(req({ 'x-real-ip': '1.2.3.4' }))).toBe('1.2.3.4');
    expect(ipDe(req({}))).toBe('desconhecido');
  });
});

describe('AUTH: formato de erro da API', () => {
  it('AUTH: erro() segue { status, erro, mensagem }', async () => {
    const res = erro(403, 'SEM_PERMISSAO', 'nope');
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ status: 403, erro: 'SEM_PERMISSAO', mensagem: 'nope' });
  });
  it('AUTH: ok() devolve o dado sem envelope', async () => {
    expect(await ok({ a: 1 }, 201).json()).toEqual({ a: 1 });
  });
  it('AUTH: erroValidacao() vira 400 com o mapa de campos', async () => {
    const r = cadastroSchema.safeParse({ nome: 'x' });
    if (r.success) throw new Error('deveria falhar');
    const res = erroValidacao(r.error);
    expect(res.status).toBe(400);
    const corpo = await res.json();
    expect(corpo.erro).toBe('VALIDACAO');
    expect(corpo.campos.nome).toBeTruthy();
    expect(corpo.campos.cpf).toBeTruthy();
  });
});
