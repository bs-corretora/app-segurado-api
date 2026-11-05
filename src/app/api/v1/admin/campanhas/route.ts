import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { campanhaSchema } from '@/lib/schemas/push';
import { enviarCampanha } from '@/lib/services/push';
import { comLog } from '@/lib/http/log';

// POST /api/v1/admin/campanhas — só ADMIN (seção 6.10). Cria a notificação MARKETING de cada
// segurado com aceita_marketing = true; o push sai na próxima chamada de /internal/push/pendentes.
async function post(req: NextRequest) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = campanhaSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const destinatarios = await enviarCampanha(entrada.data);
    return ok({ destinatarios }, 201);
  } catch (e) {
    return falhaBanco('admin/campanhas', e);
  }
}

export const POST = comLog(post);
