import { type NextRequest } from 'next/server';
import { ok, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { marcarNotificacaoLida } from '@/lib/services/leitura';
import { comLog } from '@/lib/http/log';

// PATCH /api/v1/notificacoes/{id}/lida — marca como lida (seção 6.9). Repetir não muda a data.
async function patch(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Notificação');

  try {
    const notificacao = await marcarNotificacaoLida(sessao.perfil_id, id.data);
    return notificacao ? ok(notificacao) : naoEncontrado('Notificação');
  } catch (e) {
    return falhaBanco('notificacoes/id/lida', e);
  }
}

export const PATCH = comLog(patch);
