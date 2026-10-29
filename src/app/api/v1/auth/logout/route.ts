import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { erro } from '@/lib/api-response';
import { ACCESS_COOKIE, limparSessao } from '@/lib/security/cookies';
import { usuarioAutenticado } from '@/lib/security/sessao';
import { comLog } from '@/lib/http/log';

// POST /api/v1/auth/logout — exige sessão (seções 6.1 e 6.3). Encerra a sessão e remove os cookies.
async function post(req: NextRequest) {
  const usuario = await usuarioAutenticado(req);
  if (!usuario) {
    // Sem sessão válida: 401, mas apaga os cookies que tiverem sobrado.
    return limparSessao(erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada'));
  }

  // Revoga o refresh token no Supabase. Se falhar, o logout segue mesmo assim.
  const token = req.cookies.get(ACCESS_COOKIE)!.value;
  await supabaseAdmin().auth.admin.signOut(token).catch(() => undefined);

  return limparSessao(new NextResponse(null, { status: 204 }));
}

export const POST = comLog(post);
