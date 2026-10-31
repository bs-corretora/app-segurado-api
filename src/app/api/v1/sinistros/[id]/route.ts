import { type NextRequest } from 'next/server';
import { ok, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { buscarSinistro } from '@/lib/services/sinistro';
import { comLog } from '@/lib/http/log';

// GET /api/v1/sinistros/{id} — detalhe com a linha do tempo de eventos (seção 6.6).
// De outro usuário: 404.
async function get(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Sinistro');

  try {
    const sinistro = await buscarSinistro(sessao.perfil_id, id.data);
    return sinistro ? ok(sinistro) : naoEncontrado('Sinistro');
  } catch (e) {
    return falhaBanco('sinistros/id', e);
  }
}

export const GET = comLog(get);