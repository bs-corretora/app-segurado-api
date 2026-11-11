import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { erro, erroValidacao } from '@/lib/api-response';
import { tokenDe, usuarioDoToken } from '@/lib/security/sessao';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { redefinirSenhaSchema } from '@/lib/schemas/conta';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/redefinir-senha — grava a senha nova a partir do link do e-mail (seção 6.3).
// Quem chama é a página /redefinir-senha, com o access_token que o Supabase pôs no link, em
// `Authorization: Bearer`. Só vale token nascido do link (amr = otp): um token de login comum
// tem que passar por PATCH /me/senha, que confere a senha atual. Depois de trocar, encerra todas
// as sessões da conta. 3 por minuto por IP, igual ao esqueci-senha.
async function post(req: NextRequest) {
  const bloqueio = await limitar('esqueciSenha', ipDe(req));
  if (bloqueio) return bloqueio;

  const token = tokenDe(req);
  const usuario = token ? await usuarioDoToken(token) : null;
  if (!token || !usuario) {
    return erro(401, 'NAO_AUTENTICADO', 'Link de redefinição inválido ou expirado. Peça outro.');
  }
  if (!usuario.amr.includes('otp')) {
    return erro(403, 'SEM_PERMISSAO', 'Use o link enviado por e-mail, ou PATCH /me/senha se estiver logado');
  }

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = redefinirSenhaSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const db = supabaseAdmin();
  const { error } = await db.auth.admin.updateUserById(usuario.id, {
    password: entrada.data.nova_senha,
  });
  if (error) {
    console.error('[redefinir-senha]', error.message);
    return erro(503, 'INDISPONIVEL', 'Não foi possível redefinir a senha agora');
  }
  // Quem pediu a redefinição pode estar com a conta aberta em outro aparelho: derruba tudo.
  await db.auth.admin.signOut(token, 'global').catch(() => undefined);
  return new NextResponse(null, { status: 204 });
}

export const POST = comLog(post);
