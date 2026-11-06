import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { respostaCotacaoSchema } from '@/lib/schemas/admin';
import { responderCotacao } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// PATCH /api/v1/admin/cotacoes/{id}/resposta — só ADMIN (seção 6.10). Grava a resposta, marca
// RESPONDIDA e notifica o segurado, na mesma transação. Cotação já respondida: 409.
async function patch(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Cotação');

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = respostaCotacaoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const r = await responderCotacao(id.data, entrada.data.resposta, entrada.data.valor_estimado);
    if (r.ok) return ok(r.dado);
    if (r.motivo === 'cotacao_nao_encontrada') return naoEncontrado('Cotação');
    return erro(409, 'CONFLITO', 'A cotação já foi respondida');
  } catch (e) {
    return falhaBanco('admin/cotacoes/id/resposta', e);
  }
}

export const PATCH = comLog(patch);
