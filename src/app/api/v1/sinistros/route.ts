import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { lerPaginacao, lista } from '@/lib/http/paginacao';
import { exigirSessao } from '@/lib/security/sessao';
import { abrirSinistroSchema } from '@/lib/schemas/sinistro';
import { abrirSinistro, listarSinistros } from '@/lib/services/sinistro';
import { comLog } from '@/lib/http/log';

// POST /api/v1/sinistros — abertura; devolve o protocolo (seção 6.6).
// Apólice de outro perfil ou inexistente: 404. Apólice que não está ATIVA: 409.
async function post(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = abrirSinistroSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const r = await abrirSinistro(sessao.perfil_id, entrada.data);
    if (r.ok) return ok(r.sinistro, 201);
    if (r.motivo === 'APOLICE_NAO_ENCONTRADA') return naoEncontrado('Apólice');
    if (r.motivo === 'APOLICE_INATIVA') {
      return erro(409, 'CONFLITO', 'Só é possível abrir sinistro de apólice ativa');
    }
    return erro(400, 'VALIDACAO', 'dados do sinistro inválidos');
  } catch (e) {
    return falhaBanco('sinistros', e);
  }
}

// GET /api/v1/sinistros?pagina=1&limite=20 — sinistros do usuário, mais recentes primeiro.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const pag = lerPaginacao(req.nextUrl);
  if (!pag.success) return erroValidacao(pag.error);

  try {
    const { itens, total } = await listarSinistros(sessao.perfil_id, pag.data);
    return ok(lista(itens, pag.data, total));
  } catch (e) {
    return falhaBanco('sinistros', e);
  }
}

export const POST = comLog(post);
export const GET = comLog(get);
