import { randomBytes } from 'node:crypto';
import type { Session, User } from '@supabase/supabase-js';
import { supabaseAdmin, supabaseAuth } from '@/lib/supabase/server';
import { authIndisponivel } from '@/lib/supabase/erros';
import { enviarEmail } from '@/lib/email/cliente';
import { codigoConfirmacao, redefinirSenha } from '@/lib/email/modelos';
import { descreverErro } from '@/lib/formato';

// Confirmação de e-mail e redefinição de senha (#71).
//
// Quem gera e confere o código é o Supabase Auth: `auth.admin.generateLink` devolve o código
// (`email_otp`) e o link SEM mandar e-mail nenhum, e `auth.verifyOtp` confere validade, uso único
// e expiração. O e-mail sai pelo Resend, com o modelo deste repositório.
//
// generateLink({ type: 'signup' }) com um usuário que já existe e não confirmou só gera um código
// novo: a senha do parâmetro é ignorada (supabase/auth, internal/api/mail.go, adminGenerateLink).
// Com um e-mail SEM usuário, ele CRIA o usuário — por isso o reenvio pergunta antes ao banco.

/** A senha só é usada pelo generateLink quando o usuário não existe; aqui ele sempre existe. */
const senhaDescartavel = () => `${randomBytes(24).toString('base64url')}a1`;

/**
 * Gera um código novo e manda por e-mail. true = enviado (ou registrado no log, sem Resend).
 * Nunca lança: o cadastro e o reenvio não falham por causa do e-mail.
 */
export async function enviarCodigoConfirmacao(email: string, nome?: string | null): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({
      type: 'signup',
      email,
      password: senhaDescartavel(),
    });
    if (error || !data.properties?.email_otp) {
      // email_exists = já confirmado: não há o que enviar.
      if (error?.code !== 'email_exists') {
        console.error('[confirmacao-email] generateLink:', descreverErro(error));
      }
      return false;
    }
    await enviarEmail({
      para: email,
      tipo: 'codigo-confirmacao',
      ...codigoConfirmacao({ codigo: data.properties.email_otp, nome }),
    });
    return true;
  } catch (e) {
    console.error('[confirmacao-email] envio do código:', descreverErro(e));
    return false;
  }
}

/** POST /auth/reenviar-codigo: só conta com perfil e e-mail ainda não confirmado recebe código. */
export async function reenviarCodigo(email: string): Promise<void> {
  const { data, error } = await supabaseAdmin().rpc('conta_aguardando_confirmacao', { p_email: email });
  if (error) {
    console.error('[reenviar-codigo]', descreverErro(error));
    return;
  }
  // data = nome do perfil quando a conta aguarda confirmação; null nos demais casos.
  if (typeof data === 'string') await enviarCodigoConfirmacao(email, data);
}

export type ResultadoConfirmacao =
  | { ok: true; session: Session; user: User }
  | { ok: false; motivo: 'CODIGO_INVALIDO' | 'INDISPONIVEL' };

/** Confere o código. Certo: o Supabase marca o e-mail como confirmado e já devolve a sessão. */
export async function confirmarEmail(email: string, codigo: string): Promise<ResultadoConfirmacao> {
  const { data, error } = await supabaseAuth().auth.verifyOtp({ email, token: codigo, type: 'signup' });
  if (error || !data.session || !data.user) {
    if (authIndisponivel(error)) return { ok: false, motivo: 'INDISPONIVEL' };
    return { ok: false, motivo: 'CODIGO_INVALIDO' };
  }
  return { ok: true, session: data.session, user: data.user };
}

/** Nome para a saudação. Sem perfil ou com o banco fora, o e-mail sai com "Olá!". */
async function nomeDoPerfil(id: string | undefined): Promise<string | null> {
  if (!id) return null;
  const { data } = await supabaseAdmin().from('perfil').select('nome').eq('id', id).maybeSingle();
  return (data as { nome?: string } | null)?.nome ?? null;
}

/**
 * POST /auth/esqueci-senha: link de recuperação gerado pelo Supabase Auth, e-mail pelo Resend.
 * E-mail sem conta: o generateLink responde 404 e nada é enviado. Nunca lança.
 */
export async function enviarLinkRedefinicao(email: string, redirectTo: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (error || !data.properties?.action_link) {
      if (error?.status !== 404) console.error('[esqueci-senha] generateLink:', descreverErro(error));
      return false;
    }
    await enviarEmail({
      para: email,
      tipo: 'redefinir-senha',
      ...redefinirSenha({ link: data.properties.action_link, nome: await nomeDoPerfil(data.user?.id) }),
    });
    return true;
  } catch (e) {
    console.error('[esqueci-senha] envio do link:', descreverErro(e));
    return false;
  }
}
