import { type NextRequest } from 'next/server';
import { ok, erro, falhaBanco } from '@/lib/api-response';
import { chaveInternaValida, enviarPushPendentes } from '@/lib/services/push';
import { comLog } from '@/lib/http/log';

// POST /api/v1/internal/push/pendentes — envia o push das notificações pendentes (seção 6.9).
// Não usa sessão: quem chama é o agendador (.github/workflows/push.yml), com
// `Authorization: Bearer <INTERNAL_API_KEY>`. Sem a chave configurada, recusa tudo.
async function post(req: NextRequest) {
  const cabecalho = req.headers.get('authorization');
  const chave = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!chaveInternaValida(chave)) {
    return erro(401, 'NAO_AUTENTICADO', 'Chave interna ausente ou inválida');
  }

  try {
    return ok(await enviarPushPendentes());
  } catch (e) {
    return falhaBanco('internal/push/pendentes', e);
  }
}

export const POST = comLog(post);
