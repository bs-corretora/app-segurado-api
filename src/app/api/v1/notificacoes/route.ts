import { type NextRequest } from 'next/server';
import { ok, erroValidacao, falhaBanco } from '@/lib/api-response';
import { lerPaginacao, lista } from '@/lib/http/paginacao';
import { exigirSessao } from '@/lib/security/sessao';
import { notificacoesQuerySchema } from '@/lib/schemas/app';
import { listarNotificacoes } from '@/lib/services/leitura';
import { comLog } from '@/lib/http/log';

// GET /api/v1/notificacoes?pagina=1&limite=20&nao_lidas=true — mais recentes primeiro (seção 6.9).
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const pag = lerPaginacao(req.nextUrl);
  if (!pag.success) return erroValidacao(pag.error);
  const query = notificacoesQuerySchema.safeParse({
    nao_lidas: req.nextUrl.searchParams.get('nao_lidas') ?? undefined,
  });
  if (!query.success) return erroValidacao(query.error);

  try {
    const { itens, total } = await listarNotificacoes(sessao.perfil_id, pag.data, {
      naoLidas: query.data.nao_lidas,
    });
    return ok(lista(itens, pag.data, total));
  } catch (e) {
    return falhaBanco('notificacoes', e);
  }
}

export const GET = comLog(get);
