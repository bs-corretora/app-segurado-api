import { type NextRequest } from 'next/server';
import { ok, erroValidacao, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { contatosQuerySchema } from '@/lib/schemas/app';
import { listarContatos } from '@/lib/services/leitura';
import { comLog } from '@/lib/http/log';

// GET /api/v1/contatos?tipo=ASSISTENCIA_24H|SINISTRO (seção 6.6).
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  const query = contatosQuerySchema.safeParse({
    tipo: req.nextUrl.searchParams.get('tipo') ?? undefined,
  });
  if (!query.success) return erroValidacao(query.error);

  try {
    return ok({ itens: await listarContatos(sessao.perfil_id, query.data.tipo) });
  } catch (e) {
    return falhaBanco('contatos', e);
  }
}

export const GET = comLog(get);
