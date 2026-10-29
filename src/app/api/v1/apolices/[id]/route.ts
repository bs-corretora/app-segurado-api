import { type NextRequest } from 'next/server';
import { ok, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { buscarApolice } from '@/lib/services/leitura';

// GET /api/v1/apolices/{id} — detalhe (seção 6.5). De outro usuário: 404.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Apólice');

  try {
    const apolice = await buscarApolice(sessao.perfil_id, id.data);
    return apolice ? ok(apolice) : naoEncontrado('Apólice');
  } catch (e) {
    return falhaBanco('apolices/id', e);
  }
}
