import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import type { NextRequest } from 'next/server';
import { erro } from '@/lib/api-response';

/** Seção 7.2 — contadores em memória (instância única). */
const limitadores = {
  login: new RateLimiterMemory({ keyPrefix: 'login', points: 5, duration: 60 }),
  cadastro: new RateLimiterMemory({ keyPrefix: 'cadastro', points: 3, duration: 60 }),
  esqueciSenha: new RateLimiterMemory({ keyPrefix: 'esqueci', points: 3, duration: 60 }),
  publico: new RateLimiterMemory({ keyPrefix: 'publico', points: 10, duration: 60 }),
  usuario: new RateLimiterMemory({ keyPrefix: 'usuario', points: 100, duration: 60 }),
};

export type Escopo = keyof typeof limitadores;

export function ipDe(req: NextRequest): string {
  // No Render a API fica atrás de um proxy, que ACRESCENTA o IP real no fim do
  // x-forwarded-for. O começo da lista vem do cliente e pode ser forjado (um IP
  // novo por tentativa furaria o limite de login), então vale o último valor.
  const xff = req.headers.get('x-forwarded-for');
  const ultimo = xff?.split(',').at(-1)?.trim();
  return ultimo || req.headers.get('x-real-ip') || 'desconhecido';
}

/** Retorna uma resposta 429 se o limite estourou; caso contrário, null. */
export async function limitar(escopo: Escopo, chave: string) {
  try {
    await limitadores[escopo].consume(chave);
    return null;
  } catch (e) {
    if (e instanceof RateLimiterRes) {
      const segundos = Math.max(1, Math.ceil(e.msBeforeNext / 1000));
      return erro(429, 'LIMITE_EXCEDIDO', 'Muitas tentativas. Tente novamente em instantes.', {
        headers: { 'Retry-After': String(segundos) },
      });
    }
    throw e;
  }
}
