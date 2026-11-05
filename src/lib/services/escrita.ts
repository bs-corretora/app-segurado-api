import { supabaseAdmin } from '@/lib/supabase/server';
import { faixa, type Paginacao } from '@/lib/http/paginacao';
import type { Indicado, NovaCotacao } from '@/lib/schemas/escrita';

// Etapa 4 (seções 6.7 e 6.8): cotação e indicação. Toda consulta do usuário filtra por perfil_id.

const COLUNAS_COTACAO =
  'id, produto, motivo, dados, status, resposta, valor_estimado, respondida_em, criado_em';
const COLUNAS_INDICACAO = 'id, nome, status, criado_em';

export async function criarCotacao(perfilId: string, c: NovaCotacao) {
  const { data, error } = await supabaseAdmin()
    .from('cotacao')
    .insert({ perfil_id: perfilId, produto: c.produto, motivo: c.motivo, dados: c.dados ?? null })
    .select(COLUNAS_COTACAO)
    .single();
  if (error) throw error;
  return data;
}

export async function listarCotacoes(perfilId: string, pag: Paginacao) {
  const { from, to } = faixa(pag);
  const r = await supabaseAdmin()
    .from('cotacao')
    .select(COLUNAS_COTACAO, { count: 'exact' })
    .eq('perfil_id', perfilId)
    .order('criado_em', { ascending: false })
    .range(from, to);
  if (r.error) throw r.error;
  return { itens: r.data, total: r.count ?? 0 };
}

/** Código de indicação do usuário. */
export async function codigoDeIndicacao(perfilId: string) {
  const { data, error } = await supabaseAdmin()
    .from('perfil')
    .select('codigo_indicacao')
    .eq('id', perfilId)
    .single();
  if (error) throw error;
  return data.codigo_indicacao as string;
}

/**
 * Indicações feitas pelo usuário. Telefone e e-mail do indicado ficam de fora: são dados de
 * outra pessoa, que só o administrador precisa ver.
 */
export async function listarIndicacoes(perfilId: string, pag: Paginacao) {
  const { from, to } = faixa(pag);
  const r = await supabaseAdmin()
    .from('indicacao')
    .select(COLUNAS_INDICACAO, { count: 'exact' })
    .eq('indicador_id', perfilId)
    .order('criado_em', { ascending: false })
    .range(from, to);
  if (r.error) throw r.error;
  return { itens: r.data, total: r.count ?? 0 };
}

/**
 * Registra o indicado da página pública. Só segurado tem código válido (o do administrador não
 * conta). false = código inexistente (a rota responde 404).
 */
export async function registrarIndicado(codigo: string, i: Indicado): Promise<boolean> {
  const db = supabaseAdmin();
  const indicador = await db
    .from('perfil')
    .select('id')
    .ilike('codigo_indicacao', codigo)
    .eq('papel', 'SEGURADO')
    .maybeSingle();
  if (indicador.error) throw indicador.error;
  if (!indicador.data) return false;

  const r = await db.from('indicacao').insert({
    indicador_id: indicador.data.id,
    nome: i.nome,
    telefone: i.telefone,
    email: i.email ?? null,
  });
  if (r.error) throw r.error;
  return true;
}
