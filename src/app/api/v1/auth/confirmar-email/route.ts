import { type NextRequest } from 'next/server';
import { ok, erro, erroValidacao } from '@/lib/api-response';
import { gravarSessao, tokensDoCorpo } from '@/lib/security/cookies';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { confirmarEmailSchema } from '@/lib/schemas/conta';
import { confirmarEmail } from '@/lib/services/confirmacao-email';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/confirmar-email — pública (#71). `{ email, codigo }`.
// Código certo: confirma o e-mail e já inicia a sessão, com a mesma resposta do login.
// Código errado, expirado ou já usado: 400 CODIGO_INVALIDO.
// Rate limit: 10/min por IP e 5 a cada 10 minutos por e-mail (o código tem 6 dígitos).
async function post(req: NextRequest) {
  const bloqueio = await limitar('confirmarEmail', ipDe(req));
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = confirmarEmailSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const porEmail = await limitar('confirmarEmailConta', entrada.data.email);
  if (porEmail) return porEmail;

  const r = await confirmarEmail(entrada.data.email, entrada.data.codigo);
  if (!r.ok) {
    if (r.motivo === 'INDISPONIVEL') {
      return erro(503, 'INDISPONIVEL', 'Serviço de autenticação indisponível');
    }
    return erro(400, 'CODIGO_INVALIDO', 'Código inválido ou expirado. Peça um novo código.', {
      campos: { codigo: 'código inválido ou expirado' },
    });
  }

  const corpoResposta = { id: r.user.id, email: r.user.email, ...tokensDoCorpo(r.session) };
  return gravarSessao(ok(corpoResposta), r.session);
}

export const POST = comLog(post);
