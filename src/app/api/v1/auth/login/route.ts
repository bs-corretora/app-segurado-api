import { type NextRequest } from 'next/server';
import { supabaseAuth } from '@/lib/supabase/server';
import { authIndisponivel } from '@/lib/supabase/erros';
import { ok, erro, erroValidacao } from '@/lib/api-response';
import { gravarSessao, tokensDoCorpo } from '@/lib/security/cookies';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { loginSchema } from '@/lib/schemas/conta';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/login — pública (seção 6.3). Rate limit: 5/min por IP (7.2).
async function post(req: NextRequest) {
  const bloqueio = await limitar('login', ipDe(req));
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = loginSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  // Quem confere a senha é o Supabase Auth (seções 5.2 e 7.1).
  const { data, error } = await supabaseAuth().auth.signInWithPassword({
    email: entrada.data.email,
    password: entrada.data.senha,
  });

  if (error || !data.session) {
    if (authIndisponivel(error)) {
      return erro(503, 'INDISPONIVEL', 'Serviço de autenticação indisponível');
    }
    // O Supabase só chega a esta checagem depois de conferir a senha: quem recebe 403 sabe a
    // senha da conta, então a resposta não revela nada a quem não sabe (#71).
    if (error?.code === 'email_not_confirmed') {
      return erro(
        403,
        'EMAIL_NAO_CONFIRMADO',
        'Confirme seu e-mail para entrar. Use o código que enviamos ou peça um novo.',
      );
    }
    // Mensagem genérica: não revela se o e-mail existe.
    return erro(401, 'NAO_AUTENTICADO', 'E-mail ou senha inválidos');
  }

  // Cookie para quem está no mesmo domínio; tokens no corpo para o front em outro (seção 7.1).
  const corpoResposta = { id: data.user.id, email: data.user.email, ...tokensDoCorpo(data.session) };
  return gravarSessao(ok(corpoResposta), data.session);
}

export const POST = comLog(post);
