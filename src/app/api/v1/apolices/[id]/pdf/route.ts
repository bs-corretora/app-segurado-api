import { type NextRequest } from 'next/server';
import { ok, erro, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { urlPdfApolice } from '@/lib/services/leitura';

// GET /api/v1/apolices/{id}/pdf — URL assinada do Storage, válida por 60 s (seção 6.5).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Apólice');

  try {
    const pdf = await urlPdfApolice(sessao.perfil_id, id.data);
    if (!pdf.encontrada) return naoEncontrado('Apólice');
    if (!pdf.url) return erro(404, 'NAO_ENCONTRADO', 'Esta apólice ainda não tem PDF');
    return ok({ url: pdf.url, expira_em: pdf.expira_em });
  } catch (e) {
    return falhaBanco('apolices/id/pdf', e);
  }
}
