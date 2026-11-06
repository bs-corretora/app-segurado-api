import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { idSchema } from '@/lib/schemas/app';
import { alterarContatoSchema } from '@/lib/schemas/admin';
import { alterarContato } from '@/lib/services/admin';
import { comLog } from '@/lib/http/log';

// PATCH /api/v1/admin/contatos/{id} — alteração parcial (ex.: { "ativo": false } desativa).
// Só ADMIN (seção 6.10). O contato não pode ficar sem telefone e sem WhatsApp.
async function patch(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const id = idSchema.safeParse((await params).id);
  if (!id.success) return naoEncontrado('Contato');

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = alterarContatoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const r = await alterarContato(id.data, entrada.data);
    if (r === null) return naoEncontrado('Contato');
    if (r === 'SEM_CANAL') {
      return erro(400, 'VALIDACAO', 'informe telefone ou whatsapp', {
        campos: { telefone: 'o contato precisa de telefone ou whatsapp' },
      });
    }
    return ok(r);
  } catch (e) {
    return falhaBanco('admin/contatos/id', e);
  }
}

export const PATCH = comLog(patch);
