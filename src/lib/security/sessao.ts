import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { ACCESS_COOKIE } from './cookies';

export type Usuario = { id: string; email: string | undefined };

/**
 * Lê o cookie access_token e valida o JWT no Supabase (getClaims usa JWKS
 * quando o projeto tem chaves assimétricas, ou consulta o Auth caso contrário).
 * Retorna null se não houver sessão válida → a rota responde 401.
 *
 * Na Etapa 2 completa, depois da tabela perfil (Etapa 1), este helper também
 * busca `papel` em perfil e devolve { perfil_id, papel }.
 */
export async function usuarioAutenticado(req: NextRequest): Promise<Usuario | null> {
  const token = req.cookies.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  const { data, error } = await supabaseAdmin().auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;

  return { id: data.claims.sub, email: data.claims.email as string | undefined };
}
