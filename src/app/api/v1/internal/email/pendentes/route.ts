import { type NextRequest } from 'next/server';
import { ok, erro, falhaBanco } from '@/lib/api-response';
import { chaveInternaValida } from '@/lib/services/push';
import { enviarEmailsPendentes } from '@/lib/services/avisos-email';
import { comLog } from '@/lib/http/log';

// POST /api/v1/internal/email/pendentes — reenvia os avisos por e-mail que ficaram na fila (#72).
// Mesma proteção da rota do push: quem chama é o agendador (.github/workflows/push.yml), com
// `Authorization: Bearer <INTERNAL_API_KEY>`. Sem a chave configurada, recusa tudo.
async function post(req: NextRequest) {
  const cabecalho = req.headers.get('authorization');
  const chave = cabecalho?.startsWith('Bearer ') ? cabecalho.slice(7) : null;
  if (!chaveInternaValida(chave)) {
    return erro(401, 'NAO_AUTENTICADO', 'Chave interna ausente ou inválida');
  }

  try {
    return ok(await enviarEmailsPendentes());
  } catch (e) {
    return falhaBanco('internal/email/pendentes', e);
  }
}

export const POST = comLog(post);
