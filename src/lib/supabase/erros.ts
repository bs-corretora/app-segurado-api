import type { AuthError } from '@supabase/supabase-js';

/**
 * true quando a falha é do Supabase Auth (fora do ar, sem rede, erro 5xx),
 * e não da credencial do usuário. Nesses casos a rota responde 503, não 401.
 */
export function authIndisponivel(error: AuthError | null): boolean {
  if (!error) return false;
  return error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500;
}
