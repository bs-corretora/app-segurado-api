import { supabaseAdmin } from '@/lib/supabase/server';
import { faixa, type Paginacao } from '@/lib/http/paginacao';
import type { AbrirSinistro } from '@/lib/schemas/sinistro';

// Sinistros do app (Etapa 4, seção 6.6). Toda consulta filtra por perfil_id: sinistro de outro
// perfil simplesmente não aparece, e a rota responde 404 (seção 6.1).

const COLUNAS_SINISTRO_LISTA = 'id, protocolo, tipo, status, data_ocorrencia, apolice_id, criado_em';
const COLUNAS_SINISTRO = `${COLUNAS_SINISTRO_LISTA}, local, descricao, atualizado_em`;
// autor_id fica de fora de propósito: é o id do administrador que mexeu no sinistro.
const COLUNAS_EVENTO = 'id, status, comentario, criado_em';

export type ResultadoAbertura =
  | { ok: true; sinistro: Record<string, unknown> }
  | { ok: false; motivo: 'APOLICE_NAO_ENCONTRADA' | 'APOLICE_INATIVA' | 'DADOS_INVALIDOS' };

/**
 * Abre o sinistro e grava o evento ABERTO na MESMA transação, pela função SQL
 * `abrir_sinistro` (supabase/migrations/20261030000100_funcao_abrir_sinistro.sql). A função
 * confere que a apólice é do perfil e está ATIVA; o protocolo SIN-AAAA-NNNNNN sai do trigger.
 */
export async function abrirSinistro(
  perfilId: string,
  dados: AbrirSinistro,
): Promise<ResultadoAbertura> {
  const { data, error } = await supabaseAdmin().rpc('abrir_sinistro', {
    p_perfil_id: perfilId,
    p_apolice_id: dados.apolice_id,
    p_tipo: dados.tipo,
    p_data_ocorrencia: dados.data_ocorrencia,
    p_local: dados.local ?? null,
    p_descricao: dados.descricao ?? null,
  });

  if (error) {
    // Erros que a própria função levanta (RAISE EXCEPTION), identificados pela mensagem.
    if (error.message === 'apolice_nao_encontrada') {
      return { ok: false, motivo: 'APOLICE_NAO_ENCONTRADA' };
    }
    if (error.message === 'apolice_inativa') return { ok: false, motivo: 'APOLICE_INATIVA' };
    // 23514 = check_violation: data no futuro que escapou do Zod por milissegundos, ou tipo fora
    // do domínio. O Zod já barra os dois; isto é só a rede de segurança.
    if (error.code === '23514') return { ok: false, motivo: 'DADOS_INVALIDOS' };
    throw error;
  }

  const { id, protocolo, tipo, status, data_ocorrencia, local, descricao, apolice_id, criado_em } =
    data;
  return {
    ok: true,
    sinistro: { id, protocolo, tipo, status, data_ocorrencia, local, descricao, apolice_id, criado_em },
  };
}

export async function listarSinistros(perfilId: string, pag: Paginacao) {
  const { from, to } = faixa(pag);
  const r = await supabaseAdmin()
    .from('sinistro')
    .select(COLUNAS_SINISTRO_LISTA, { count: 'exact' })
    .eq('perfil_id', perfilId)
    .order('criado_em', { ascending: false })
    .range(from, to);
  if (r.error) throw r.error;
  return { itens: r.data, total: r.count ?? 0 };
}

/** Sinistro com a linha do tempo (eventos do mais antigo ao mais novo). null = não encontrado. */
export async function buscarSinistro(perfilId: string, id: string) {
  const db = supabaseAdmin();
  const s = await db
    .from('sinistro')
    .select(COLUNAS_SINISTRO)
    .eq('perfil_id', perfilId)
    .eq('id', id)
    .maybeSingle();
  if (s.error) throw s.error;
  if (!s.data) return null;

  const e = await db
    .from('sinistro_evento')
    .select(COLUNAS_EVENTO)
    .eq('sinistro_id', id)
    .order('criado_em');
  if (e.error) throw e.error;
  return { ...s.data, eventos: e.data };
}