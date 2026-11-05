import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { statusSinistroSchema } from '@/lib/schemas/admin';
import { alterarStatusSinistro } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// PATCH /api/v1/admin/sinistros/{id}/status — só ADMIN (seções 5.4 e 6.10).
// Grava o evento na linha do tempo e notifica o segurado, na mesma transação.
// O status só anda para a frente (ABERTO → EM_ANALISE → CONCLUIDO); repetir ou voltar é 409.
async function patch(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Sinistro');

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = statusSinistroSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const r = await alterarStatusSinistro(
      id.data,
      entrada.data.status,
      entrada.data.comentario,
      sessao.perfil_id,
    );
    if (r.ok) return ok(r.dado);
    if (r.motivo === 'sinistro_nao_encontrado') return naoEncontrado('Sinistro');
    if (r.motivo === 'status_igual') {
      return erro(409, 'CONFLITO', `O sinistro já está como ${entrada.data.status}`);
    }
    return erro(409, 'CONFLITO', 'O status do sinistro só pode avançar');
  } catch (e) {
    return falhaBanco('admin/sinistros/id/status', e);
  }
}

export const PATCH = comLog(patch);
