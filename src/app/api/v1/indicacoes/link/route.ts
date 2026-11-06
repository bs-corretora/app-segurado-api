import { type NextRequest } from 'next/server';
import { ok, falhaBanco } from '@/lib/api-response';
import { getEnv } from '@/lib/env';
import { exigirSessao } from '@/lib/security/sessao';
import { codigoDeIndicacao } from '@/lib/services/escrita';
import { comLog } from '@/lib/http/log';

// GET /api/v1/indicacoes/link — link da página pública de indicação do usuário (seção 6.8).
// A base vem de PUBLIC_BASE_URL; sem ela, de RENDER_EXTERNAL_URL (o Render preenche sozinho, pois
// atrás do proxy dele a requisição chega como 0.0.0.0:10000); fora do Render, do endereço da requisição.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  try {
    const codigo = await codigoDeIndicacao(sessao.perfil_id);
    const base =
      getEnv().PUBLIC_BASE_URL ??
      process.env.RENDER_EXTERNAL_URL?.replace(/\/+$/, '') ??
      req.nextUrl.origin;
    return ok({ codigo, link: `${base}/indicacao/${encodeURIComponent(codigo)}` });
  } catch (e) {
    return falhaBanco('indicacoes/link', e);
  }
}

export const GET = comLog(get);
