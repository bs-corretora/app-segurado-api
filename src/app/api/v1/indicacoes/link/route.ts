import { type NextRequest } from 'next/server';
import { ok, falhaBanco } from '@/lib/api-response';
import { getEnv } from '@/lib/env';
import { exigirSessao } from '@/lib/security/sessao';
import { codigoDeIndicacao } from '@/lib/services/escrita';
import { comLog } from '@/lib/http/log';

// GET /api/v1/indicacoes/link — link da página pública de indicação do usuário (seção 6.8).
// A base vem de PUBLIC_BASE_URL; sem ela, do endereço desta requisição (serve no localhost).
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  try {
    const codigo = await codigoDeIndicacao(sessao.perfil_id);
    const base = getEnv().PUBLIC_BASE_URL ?? req.nextUrl.origin;
    return ok({ codigo, link: `${base}/indicacao/${encodeURIComponent(codigo)}` });
  } catch (e) {
    return falhaBanco('indicacoes/link', e);
  }
}

export const GET = comLog(get);
