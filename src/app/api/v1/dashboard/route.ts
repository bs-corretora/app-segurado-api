import { type NextRequest } from 'next/server';
import { ok, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { dashboard } from '@/lib/services/leitura';

// GET /api/v1/dashboard — tela Início (seção 6.4).
export async function GET(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  try {
    return ok(await dashboard(sessao.perfil_id));
  } catch (e) {
    return falhaBanco('dashboard', e);
  }
}
