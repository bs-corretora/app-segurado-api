import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { dispositivoSchema } from '@/lib/schemas/push';
import { registrarDispositivo } from '@/lib/services/push';
import { comLog } from '@/lib/http/log';

// POST /api/v1/dispositivos — registra ou atualiza o token de push do aparelho (seção 6.9).
async function post(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = dispositivoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    return ok(await registrarDispositivo(sessao.perfil_id, entrada.data), 201);
  } catch (e) {
    return falhaBanco('dispositivos', e);
  }
}

export const POST = comLog(post);
