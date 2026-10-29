import { type NextRequest } from 'next/server';
import { ok, erroValidacao, falhaBanco } from '@/lib/api-response';
import { lerPaginacao, lista } from '@/lib/http/paginacao';
import { exigirSessao } from '@/lib/security/sessao';
import { listarApolices } from '@/lib/services/leitura';
import { comLog } from '@/lib/http/log';

// GET /api/v1/apolices?pagina=1&limite=20 — apólices do usuário (seção 6.5).
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const pag = lerPaginacao(req.nextUrl);
  if (!pag.success) return erroValidacao(pag.error);

  try {
    const { itens, total } = await listarApolices(sessao.perfil_id, pag.data);
    return ok(lista(itens, pag.data, total));
  } catch (e) {
    return falhaBanco('apolices', e);
  }
}

export const GET = comLog(get);
