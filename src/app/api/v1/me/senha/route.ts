import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, supabaseAuth } from '@/lib/supabase/server';
import { authIndisponivel } from '@/lib/supabase/erros';
import { erro, erroValidacao } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { limitar } from '@/lib/security/rate-limit';
import { trocarSenhaSchema } from '@/lib/schemas/conta';
import { comLog } from '@/lib/http/log';

// PATCH /api/v1/me/senha — troca de senha do usuário logado (seção 6.3). Confere a senha atual
// antes; 5 tentativas por minuto por usuário, igual ao login. A sessão atual continua valendo.
async function patch(req: NextRequest) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;
  if (!sessao.email) return erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada');

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');
  const entrada = trocarSenhaSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const bloqueio = await limitar('login', `senha:${sessao.perfil_id}`);
  if (bloqueio) return bloqueio;

  // Quem confere a senha atual é o Supabase Auth, com um cliente descartável.
  const { data, error } = await supabaseAuth().auth.signInWithPassword({
    email: sessao.email,
    password: entrada.data.senha_atual,
  });
  if (error || !data.session) {
    if (authIndisponivel(error)) {
      return erro(503, 'INDISPONIVEL', 'Serviço de autenticação indisponível');
    }
    return erro(400, 'VALIDACAO', 'senha atual incorreta', {
      campos: { senha_atual: 'senha atual incorreta' },
    });
  }
  // A conferência abriu uma sessão que ninguém vai usar: encerra só ela.
  await supabaseAdmin().auth.admin.signOut(data.session.access_token, 'local').catch(() => undefined);

  const { error: falha } = await supabaseAdmin().auth.admin.updateUserById(sessao.perfil_id, {
    password: entrada.data.nova_senha,
  });
  if (falha) {
    console.error('[me/senha]', falha.message);
    return erro(503, 'INDISPONIVEL', 'Não foi possível trocar a senha agora');
  }
  return new NextResponse(null, { status: 204 });
}

export const PATCH = comLog(patch);
