import { type NextRequest } from 'next/server';
import { ok, erroValidacao, falhaBanco } from '@/lib/api-response';
import { lerPaginacao, lista } from '@/lib/http/paginacao';
import { exigirSessao } from '@/lib/security/sessao';
import { buscaSeguradosSchema } from '@/lib/schemas/admin';
import { buscarSegurados } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// GET /api/v1/admin/segurados?busca=&pagina=&limite= — só ADMIN (seção 6.10).
// busca: parte do nome, começo do CPF (com ou sem pontuação) ou parte do e-mail.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const pag = lerPaginacao(req.nextUrl);
  if (!pag.success) return erroValidacao(pag.error);
  const query = buscaSeguradosSchema.safeParse({
    busca: req.nextUrl.searchParams.get('busca') ?? undefined,
  });
  if (!query.success) return erroValidacao(query.error);

  try {
    const { itens, total } = await buscarSegurados(query.data.busca, pag.data);
    return ok(lista(itens, pag.data, total));
  } catch (e) {
    return falhaBanco('admin/segurados', e);
  }
}

export const GET = comLog(get);
