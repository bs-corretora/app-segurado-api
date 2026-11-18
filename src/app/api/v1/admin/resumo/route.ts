import { type NextRequest } from 'next/server';
import { ok, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { resumo } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// GET /api/v1/admin/resumo — indicadores da página inicial do painel (seção 6.10, P2). Só ADMIN.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  try {
    return ok(await resumo());
  } catch (e) {
    return falhaBanco('admin/resumo', e);
  }
}

export const GET = comLog(get);
