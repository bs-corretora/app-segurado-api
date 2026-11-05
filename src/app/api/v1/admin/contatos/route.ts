import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { contatosFiltroSchema, novoContatoSchema } from '@/lib/schemas/admin';
import { criarContato, listarContatos } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// Manutenção dos contatos de assistência e sinistro (seção 6.10). Só ADMIN.
// A alteração é PATCH /api/v1/admin/contatos/{id}.

// GET /api/v1/admin/contatos?tipo= — todos, inclusive os inativos.
async function get(req: NextRequest) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const query = contatosFiltroSchema.safeParse({
    tipo: req.nextUrl.searchParams.get('tipo') ?? undefined,
  });
  if (!query.success) return erroValidacao(query.error);

  try {
    return ok({ itens: await listarContatos(query.data.tipo) });
  } catch (e) {
    return falhaBanco('admin/contatos', e);
  }
}

// POST /api/v1/admin/contatos — precisa de telefone ou WhatsApp.
async function post(req: NextRequest) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = novoContatoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    return ok(await criarContato(entrada.data), 201);
  } catch (e) {
    return falhaBanco('admin/contatos', e);
  }
}

export const GET = comLog(get);
export const POST = comLog(post);
