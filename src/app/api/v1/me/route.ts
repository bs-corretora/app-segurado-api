import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { atualizarPerfil, buscarPerfil } from '@/lib/services/perfil';
import { atualizarMeSchema } from '@/lib/schemas/conta';
import { comLog } from '@/lib/http/log';

// GET /api/v1/me — exige sessão (seção 6.3). Dados do perfil + e-mail do Auth.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const { data, error } = await buscarPerfil(sessao.perfil_id);
  if (error) {
    console.error('[me]', error);
    return erro(503, 'INDISPONIVEL', 'Banco de dados indisponível');
  }
  return ok({ ...data, email: sessao.email });
}

// PATCH /api/v1/me — atualiza telefone e aceita_marketing (seção 6.3).
async function patch(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = atualizarMeSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const { data, error } = await atualizarPerfil(sessao.perfil_id, entrada.data);
  if (error) {
    console.error('[me] PATCH', error);
    return erro(503, 'INDISPONIVEL', 'Banco de dados indisponível');
  }
  return ok({ ...data, email: sessao.email });
}

export const GET = comLog(get);
export const PATCH = comLog(patch);
