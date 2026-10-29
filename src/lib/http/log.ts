import type { NextRequest } from 'next/server';

/**
 * Envolve o handler de uma rota e escreve uma linha por requisição no log
 * do contêiner: método, caminho, status e duração. Nunca registra corpo,
 * query string nem cookies (podem ter senha, CPF ou token).
 *
 *   export const GET = comLog(get);
 */
export function comLog<A extends unknown[]>(
  handler: (req: NextRequest, ...resto: A) => Promise<Response>,
) {
  return async (req: NextRequest, ...resto: A): Promise<Response> => {
    const inicio = performance.now();
    let status = 500;
    try {
      const resposta = await handler(req, ...resto);
      status = resposta.status;
      return resposta;
    } finally {
      const ms = Math.round(performance.now() - inicio);
      console.log(`${req.method} ${req.nextUrl.pathname} ${status} ${ms}ms`);
    }
  };
}
