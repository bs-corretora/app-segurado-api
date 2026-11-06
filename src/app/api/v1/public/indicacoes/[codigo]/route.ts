import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao, falhaBanco, naoEncontrado } from '@/lib/api-response';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { codigoIndicacaoSchema, indicadoSchema } from '@/lib/schemas/escrita';
import { registrarIndicado } from '@/lib/services/escrita';
import { comLog } from '@/lib/http/log';

// POST /api/v1/public/indicacoes/{codigo} — pública (seção 6.8): o indicado deixa nome e telefone
// na página /indicacao/{codigo}. Rate limit: 10/min por IP (seção 7.2). A resposta não revela
// nada do segurado que indicou.
async function post(req: NextRequest, { params }: { params: Promise<{ codigo: string }> }) {
  const bloqueio = await limitar('publico', ipDe(req));
  if (bloqueio) return bloqueio;

  const codigo = codigoIndicacaoSchema.safeParse((await params).codigo);
  if (!codigo.success) return naoEncontrado('Indicação');

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = indicadoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const registrado = await registrarIndicado(codigo.data, entrada.data);
    if (!registrado) return naoEncontrado('Indicação');
    return ok({ mensagem: 'Recebemos seus dados. Um corretor da BS Seguros vai entrar em contato.' }, 201);
  } catch (e) {
    return falhaBanco('public/indicacoes', e);
  }
}

export const POST = comLog(post);
