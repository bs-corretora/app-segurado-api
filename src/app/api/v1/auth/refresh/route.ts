import { type NextRequest } from 'next/server';
import { supabaseAuth } from '@/lib/supabase/server';
import { authIndisponivel } from '@/lib/supabase/erros';
import { ok, erro } from '@/lib/api-response';
import { REFRESH_COOKIE, gravarSessao, limparSessao } from '@/lib/security/cookies';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/refresh — pública (seção 6.3). Renova a sessão pelo cookie de refresh.
async function post(req: NextRequest) {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) return erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada');

  const { data, error } = await supabaseAuth().auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    if (authIndisponivel(error)) {
      return erro(503, 'INDISPONIVEL', 'Serviço de autenticação indisponível');
    }
    // Refresh vencido, revogado ou já usado: apaga os cookies e o app volta ao login.
    return limparSessao(erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada'));
  }

  return gravarSessao(ok({ renovada: true }), data.session);
}

export const POST = comLog(post);
