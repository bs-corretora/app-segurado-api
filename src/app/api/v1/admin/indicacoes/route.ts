import { type NextRequest } from 'next/server';
import { ok, erroValidacao, falhaBanco } from '@/lib/api-response';
import { lerPaginacao, lista } from '@/lib/http/paginacao';
import { exigirSessao } from '@/lib/security/sessao';
import { indicacoesFiltroSchema } from '@/lib/schemas/admin';
import { listarIndicacoes } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// GET /api/v1/admin/indicacoes?status= — todas as indicações, mais recentes primeiro. Só ADMIN.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const pag = lerPaginacao(req.nextUrl);
  if (!pag.success) return erroValidacao(pag.error);
  const query = indicacoesFiltroSchema.safeParse({
    status: req.nextUrl.searchParams.get('status') ?? undefined,
  });
  if (!query.success) return erroValidacao(query.error);

  try {
    const { itens, total } = await listarIndicacoes(query.data.status, pag.data);
    return ok(lista(itens, pag.data, total));
  } catch (e) {
    return falhaBanco('admin/indicacoes', e);
  }
}

export const GET = comLog(get);
