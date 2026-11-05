import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco } from '@/lib/api-response';
import { lerPaginacao, lista } from '@/lib/http/paginacao';
import { exigirSessao } from '@/lib/security/sessao';
import { cotacaoSchema } from '@/lib/schemas/escrita';
import { criarCotacao, listarCotacoes } from '@/lib/services/escrita';
import { comLog } from '@/lib/http/log';

// POST /api/v1/cotacoes — registra o pedido de cotação (seção 6.7). Nasce RECEBIDA.
async function post(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = cotacaoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    return ok(await criarCotacao(sessao.perfil_id, entrada.data), 201);
  } catch (e) {
    return falhaBanco('cotacoes', e);
  }
}

// GET /api/v1/cotacoes?pagina=1&limite=20 — pedidos do usuário, com a resposta quando houver.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const pag = lerPaginacao(req.nextUrl);
  if (!pag.success) return erroValidacao(pag.error);

  try {
    const { itens, total } = await listarCotacoes(sessao.perfil_id, pag.data);
    return ok(lista(itens, pag.data, total));
  } catch (e) {
    return falhaBanco('cotacoes', e);
  }
}

export const POST = comLog(post);
export const GET = comLog(get);
