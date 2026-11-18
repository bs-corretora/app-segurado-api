import { type NextRequest } from 'next/server';
import { ok, falhaBanco } from '@/lib/api-response';
import { baseUrl } from '@/lib/http/base-url';
import { exigirSessao } from '@/lib/security/sessao';
import { codigoDeIndicacao } from '@/lib/services/escrita';
import { comLog } from '@/lib/http/log';

// GET /api/v1/indicacoes/link — link da página pública de indicação do usuário (seção 6.8).
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  try {
    const codigo = await codigoDeIndicacao(sessao.perfil_id);
    return ok({ codigo, link: `${baseUrl(req)}/indicacao/${encodeURIComponent(codigo)}` });
  } catch (e) {
    return falhaBanco('indicacoes/link', e);
  }
}

export const GET = comLog(get);
