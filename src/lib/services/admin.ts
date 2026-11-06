import { supabaseAdmin } from '@/lib/supabase/server';
import { faixa, type Paginacao } from '@/lib/http/paginacao';
import type { AlterarContato, NovoContato } from '@/lib/schemas/admin';

// Administração (Etapa 5, seção 6.10). As rotas só chegam aqui depois de exigirSessao com papel
// ADMIN; por isso as consultas não filtram por perfil. O que precisa de transação ou de
// auth.users é função SQL (supabase/migrations/20261105000300_admin.sql).

/** Erro de regra levantado pelas funções SQL (RAISE EXCEPTION '<codigo>'). */
type ErroRegra = { message?: string; code?: string };

/** Traduz o RAISE da função em motivo; outros erros sobem para a rota responder 503. */
function motivoDe<M extends string>(error: ErroRegra, motivos: readonly M[]): M {
  if (error.code === 'P0001' && motivos.includes(error.message as M)) return error.message as M;
  throw error;
}

export type Resultado<T, M extends string> = { ok: true; dado: T } | { ok: false; motivo: M };

// ----- Segurados ------------------------------------------------------------------------------

export async function buscarSegurados(busca: string | undefined, pag: Paginacao) {
  const { from } = faixa(pag);
  const { data, error } = await supabaseAdmin().rpc('admin_buscar_segurados', {
    p_busca: busca ?? null,
    p_limite: pag.limite,
    p_offset: from,
  });
  if (error) throw error;
  const linhas = (data ?? []) as ({ total: number } & Record<string, unknown>)[];
  const total = linhas.length > 0 ? Number(linhas[0].total) : 0;
  const itens = linhas.map((linha) => {
    const copia: Record<string, unknown> = { ...linha };
    delete copia.total;
    return copia;
  });
  return { itens, total };
}

const COLUNAS_PERFIL =
  'id, nome, cpf, telefone, data_nascimento, cliente_desde, codigo_indicacao, aceita_marketing, criado_em';
const COLUNAS_APOLICE = 'id, numero, produto, status, inicio_vigencia, fim_vigencia, premio';

/** Perfil + e-mail + apólices. null = não existe ou não é segurado. */
export async function buscarSegurado(id: string) {
  const db = supabaseAdmin();
  const perfil = await db
    .from('perfil')
    .select(COLUNAS_PERFIL)
    .eq('id', id)
    .eq('papel', 'SEGURADO')
    .maybeSingle();
  if (perfil.error) throw perfil.error;
  if (!perfil.data) return null;

  const [email, apolices] = await Promise.all([
    db.rpc('admin_email_do_segurado', { p_id: id }),
    db
      .from('apolice')
      .select(COLUNAS_APOLICE)
      .eq('perfil_id', id)
      .order('status')
      .order('inicio_vigencia', { ascending: false }),
  ]);
  if (email.error) throw email.error;
  if (apolices.error) throw apolices.error;
  return { ...perfil.data, email: email.data as string | null, apolices: apolices.data };
}

// ----- Listas com filtro de status ------------------------------------------------------------

async function listar(
  tabela: string,
  colunas: string,
  status: string | undefined,
  pag: Paginacao,
) {
  const { from, to } = faixa(pag);
  let q = supabaseAdmin().from(tabela).select(colunas, { count: 'exact' });
  if (status) q = q.eq('status', status);
  const r = await q.order('criado_em', { ascending: false }).range(from, to);
  if (r.error) throw r.error;
  return { itens: r.data, total: r.count ?? 0 };
}

export const listarSinistros = (status: string | undefined, pag: Paginacao) =>
  listar(
    'sinistro',
    'id, protocolo, tipo, status, data_ocorrencia, criado_em, atualizado_em, ' +
      'segurado:perfil_id(id, nome), apolice:apolice_id(id, numero, produto)',
    status,
    pag,
  );

export const listarCotacoes = (status: string | undefined, pag: Paginacao) =>
  listar(
    'cotacao',
    'id, produto, motivo, dados, status, resposta, valor_estimado, respondida_em, criado_em, ' +
      'segurado:perfil_id(id, nome)',
    status,
    pag,
  );

export const listarIndicacoes = (status: string | undefined, pag: Paginacao) =>
  listar(
    'indicacao',
    'id, nome, telefone, email, status, criado_em, indicador:indicador_id(id, nome)',
    status,
    pag,
  );

// ----- Mudanças de estado (funções SQL) -------------------------------------------------------

const MOTIVOS_SINISTRO = ['sinistro_nao_encontrado', 'status_igual', 'transicao_invalida'] as const;
const MOTIVOS_COTACAO = ['cotacao_nao_encontrada', 'cotacao_ja_respondida'] as const;
const MOTIVOS_INDICACAO = ['indicacao_nao_encontrada', 'status_igual', 'transicao_invalida'] as const;

export async function alterarStatusSinistro(
  id: string,
  status: string,
  comentario: string,
  autorId: string,
): Promise<Resultado<unknown, (typeof MOTIVOS_SINISTRO)[number]>> {
  const { data, error } = await supabaseAdmin().rpc('admin_alterar_status_sinistro', {
    p_sinistro_id: id,
    p_status: status,
    p_comentario: comentario,
    p_autor_id: autorId,
  });
  if (error) return { ok: false, motivo: motivoDe(error, MOTIVOS_SINISTRO) };
  return { ok: true, dado: data };
}

export async function responderCotacao(
  id: string,
  resposta: string,
  valorEstimado: number | undefined,
): Promise<Resultado<unknown, (typeof MOTIVOS_COTACAO)[number]>> {
  const { data, error } = await supabaseAdmin().rpc('admin_responder_cotacao', {
    p_cotacao_id: id,
    p_resposta: resposta,
    p_valor_estimado: valorEstimado ?? null,
  });
  if (error) return { ok: false, motivo: motivoDe(error, MOTIVOS_COTACAO) };
  return { ok: true, dado: data };
}

export async function alterarStatusIndicacao(
  id: string,
  status: string,
): Promise<Resultado<unknown, (typeof MOTIVOS_INDICACAO)[number]>> {
  const { data, error } = await supabaseAdmin().rpc('admin_alterar_status_indicacao', {
    p_indicacao_id: id,
    p_status: status,
  });
  if (error) return { ok: false, motivo: motivoDe(error, MOTIVOS_INDICACAO) };
  return { ok: true, dado: data };
}

// ----- Contatos -------------------------------------------------------------------------------

const COLUNAS_CONTATO = 'id, tipo, produto, rotulo, telefone, whatsapp, ativo';

/** Todos os contatos, inclusive os inativos (o app só vê os ativos). */
export async function listarContatos(tipo: string | undefined) {
  let q = supabaseAdmin().from('contato_assistencia').select(COLUNAS_CONTATO);
  if (tipo) q = q.eq('tipo', tipo);
  const r = await q.order('tipo').order('rotulo');
  if (r.error) throw r.error;
  return r.data;
}

export async function criarContato(c: NovoContato) {
  const r = await supabaseAdmin()
    .from('contato_assistencia')
    .insert(c)
    .select(COLUNAS_CONTATO)
    .single();
  if (r.error) throw r.error;
  return r.data;
}

/**
 * Alteração parcial. null = não encontrado; 'SEM_CANAL' = a alteração deixaria o contato sem
 * telefone e sem WhatsApp.
 */
export async function alterarContato(id: string, c: AlterarContato) {
  const db = supabaseAdmin();
  const atual = await db
    .from('contato_assistencia')
    .select('telefone, whatsapp')
    .eq('id', id)
    .maybeSingle();
  if (atual.error) throw atual.error;
  if (!atual.data) return null;

  const telefone = c.telefone === undefined ? atual.data.telefone : c.telefone;
  const whatsapp = c.whatsapp === undefined ? atual.data.whatsapp : c.whatsapp;
  if (telefone === null && whatsapp === null) return 'SEM_CANAL' as const;

  const r = await db
    .from('contato_assistencia')
    .update(c)
    .eq('id', id)
    .select(COLUNAS_CONTATO)
    .single();
  if (r.error) throw r.error;
  return r.data;
}
