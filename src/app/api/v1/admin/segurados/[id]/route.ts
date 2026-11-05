import { type NextRequest } from 'next/server';
import { ok, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { buscarSegurado } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// GET /api/v1/admin/segurados/{id} — perfil, e-mail e apólices. Só ADMIN (seção 6.10).
async function get(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Segurado');

  try {
    const segurado = await buscarSegurado(id.data);
    return segurado ? ok(segurado) : naoEncontrado('Segurado');
  } catch (e) {
    return falhaBanco('admin/segurados/id', e);
  }
}

export const GET = comLog(get);
