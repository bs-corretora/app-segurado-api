import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { statusIndicacaoSchema } from '@/lib/schemas/admin';
import { alterarStatusIndicacao } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// PATCH /api/v1/admin/indicacoes/{id}/status — só ADMIN (seção 6.10).
// O status só anda para a frente (NOVA → CONTATADA → CONVERTIDA); repetir ou voltar é 409.
async function patch(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Indicação');

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = statusIndicacaoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const r = await alterarStatusIndicacao(id.data, entrada.data.status);
    if (r.ok) return ok(r.dado);
    if (r.motivo === 'indicacao_nao_encontrada') return naoEncontrado('Indicação');
    if (r.motivo === 'status_igual') {
      return erro(409, 'CONFLITO', `A indicação já está como ${entrada.data.status}`);
    }
    return erro(409, 'CONFLITO', 'O status da indicação só pode avançar');
  } catch (e) {
    return falhaBanco('admin/indicacoes/id/status', e);
  }
}

export const PATCH = comLog(patch);
