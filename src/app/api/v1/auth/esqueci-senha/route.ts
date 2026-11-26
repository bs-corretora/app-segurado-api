import { type NextRequest, NextResponse } from 'next/server';
import { enviarLinkRedefinicao } from '@/lib/services/confirmacao-email';
import { erro, erroValidacao } from '@/lib/api-response';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { esqueciSenhaSchema } from '@/lib/schemas/conta';
import { baseUrl } from '@/lib/http/base-url';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/esqueci-senha — pública (seção 6.3). Rate limit: 3/min por IP (7.2).
// Responde 204 sempre que a entrada é válida: não revela se o e-mail tem conta.
// O link é gerado pelo Supabase Auth (generateLink, tipo recovery) e o e-mail sai pelo Resend
// (#71). Ele abre /redefinir-senha nesta mesma API (o endereço precisa estar na lista de
// Redirect URLs do Supabase Auth, senão o Supabase manda para o Site URL).
// Além do limite por IP, 3 pedidos a cada 15 minutos por e-mail.
async function post(req: NextRequest) {
  const bloqueio = await limitar('esqueciSenha', ipDe(req));
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = esqueciSenhaSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const porEmail = await limitar('esqueciSenhaEmail', entrada.data.email);
  if (porEmail) return porEmail;

  await enviarLinkRedefinicao(entrada.data.email, `${baseUrl(req)}/redefinir-senha`);

  return new NextResponse(null, { status: 204 });
}

export const POST = comLog(post);
