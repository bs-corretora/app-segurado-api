import { type NextRequest } from 'next/server';
import { ok, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { buscarCotacao } from '@/lib/services/escrita';
import { comLog } from '@/lib/http/log';

// GET /api/v1/cotacoes/{id} — detalhe do pedido, com a resposta quando houver (seção 6.7).
// De outro usuário: 404.
async function get(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Cotação');

  try {
    const cotacao = await buscarCotacao(sessao.perfil_id, id.data);
    return cotacao ? ok(cotacao) : naoEncontrado('Cotação');
  } catch (e) {
    return falhaBanco('cotacoes/id', e);
  }
}

export const GET = comLog(get);
