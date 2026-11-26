import { type NextRequest, NextResponse } from 'next/server';
import { erro, erroValidacao } from '@/lib/api-response';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { reenviarCodigoSchema } from '@/lib/schemas/conta';
import { reenviarCodigo } from '@/lib/services/confirmacao-email';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/reenviar-codigo — pública (#71). `{ email }`.
// Responde 204 sempre que a entrada é válida: não revela se o e-mail tem conta nem se ela já foi
// confirmada. Só conta com e-mail ainda não confirmado recebe código novo (o anterior deixa de valer).
// Rate limit: 3/min por IP e 3 a cada 15 minutos por e-mail.
async function post(req: NextRequest) {
  const bloqueio = await limitar('reenviarCodigo', ipDe(req));
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = reenviarCodigoSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const porEmail = await limitar('reenviarCodigoConta', entrada.data.email);
  if (porEmail) return porEmail;

  await reenviarCodigo(entrada.data.email);
  return new NextResponse(null, { status: 204 });
}

export const POST = comLog(post);
