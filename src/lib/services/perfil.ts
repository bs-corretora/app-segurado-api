import { supabaseAdmin } from '@/lib/supabase/server';

/** Colunas do perfil que o app pode ver (GET /me). */
export const COLUNAS_PERFIL =
  'id, nome, cpf, telefone, data_nascimento, cliente_desde, papel, codigo_indicacao, aceita_marketing, termos_aceitos_em, criado_em';

export async function buscarPerfil(perfilId: string) {
  return supabaseAdmin().from('perfil').select(COLUNAS_PERFIL).eq('id', perfilId).single();
}

export async function atualizarPerfil(
  perfilId: string,
  dados: { telefone?: string | null; aceita_marketing?: boolean },
) {
  return supabaseAdmin()
    .from('perfil')
    .update(dados)
    .eq('id', perfilId)
    .select(COLUNAS_PERFIL)
    .single();
}
