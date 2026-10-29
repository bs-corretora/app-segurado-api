import type { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { erro } from '@/lib/api-response';
import { ACCESS_COOKIE } from './cookies';
import { limitar } from './rate-limit';

export type Usuario = { id: string; email: string | undefined };

export type Papel = 'SEGURADO' | 'ADMIN';

/** O que as rotas autenticadas recebem (seção 6.1 e PLANO, Etapa 2). */
export type Sessao = { perfil_id: string; papel: Papel; email: string | undefined };

/**
 * Lê o cookie access_token e valida o JWT no Supabase (getClaims usa JWKS
 * quando o projeto tem chaves assimétricas, ou consulta o Auth caso contrário).
 * Retorna null se não houver sessão válida → a rota responde 401.
 */
export async function usuarioAutenticado(req: NextRequest): Promise<Usuario | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await supabaseAdmin().auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;

  return { id: data.claims.sub, email: data.claims.email as string | undefined };
}

/**
 * Porta de entrada das rotas autenticadas: valida a sessão, aplica o limite
 * de 100 req/min por usuário (seção 7.2) e busca o papel no perfil.
 * Devolve a sessão ou a resposta de erro pronta (401/429/403).
 *
 *   const sessao = await exigirSessao(req);
 *   if (sessao instanceof Response) return sessao;
 */
export async function exigirSessao(
  req: NextRequest,
  opts?: { papel?: Papel },
): Promise<Sessao | NextResponse> {
  const usuario = await usuarioAutenticado(req);
  if (!usuario) return erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada');

  const bloqueio = await limitar('usuario', usuario.id);
  if (bloqueio) return bloqueio;

  const { data: perfil, error } = await supabaseAdmin()
    .from('perfil')
    .select('papel')
    .eq('id', usuario.id)
    .maybeSingle();

  if (error) {
    console.error('[sessao] erro ao buscar perfil:', error);
    return erro(503, 'INDISPONIVEL', 'Banco de dados indisponível');
  }
  // Usuário do Auth sem perfil (conta removida pelo administrador): trata como sem sessão.
  if (!perfil) return erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada');

  if (opts?.papel && perfil.papel !== opts.papel) {
    return erro(403, 'SEM_PERMISSAO', 'Seu perfil não tem acesso a este recurso');
  }

  return { perfil_id: usuario.id, papel: perfil.papel as Papel, email: usuario.email };
}
