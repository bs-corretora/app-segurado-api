import { supabaseAdmin } from '@/lib/supabase/server';
import { faixa, type Paginacao } from '@/lib/http/paginacao';
import { aniversarioHoje, iniciais, tempoDeCasa } from '@/lib/datas';

// Consultas do app (Etapa 3). Toda consulta filtra por perfil_id: registro de
// outro perfil simplesmente não aparece, e a rota responde 404 (seção 6.1).

const COLUNAS_APOLICE_LISTA = 'id, produto, numero, status, inicio_vigencia, fim_vigencia';
const COLUNAS_APOLICE = `${COLUNAS_APOLICE_LISTA}, premio`;
const COLUNAS_NOTIFICACAO =
  'id, tipo, titulo, mensagem, destino_tipo, destino_id, lida_em, criado_em';

/** Lança o erro do Supabase para a rota transformar em 503. Para .single() e listas. */
function ou<T>(r: { data: T | null; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data as T;
}

/** Igual a `ou`, para .maybeSingle(): null quer dizer "não existe para este perfil". */
function talvez<T>(r: { data: T | null; error: unknown }): T | null {
  if (r.error) throw r.error;
  return r.data;
}

export async function dashboard(perfilId: string) {
  const db = supabaseAdmin();
  const [perfil, ativas, naoLidas] = await Promise.all([
    db.from('perfil').select('nome, data_nascimento, cliente_desde').eq('id', perfilId).single(),
    db
      .from('apolice')
      .select(COLUNAS_APOLICE_LISTA)
      .eq('perfil_id', perfilId)
      .eq('status', 'ATIVA')
      .order('fim_vigencia'),
    db
      .from('notificacao')
      .select('id', { count: 'exact', head: true })
      .eq('perfil_id', perfilId)
      .is('lida_em', null),
  ]);
  const p = ou(perfil);
  if (naoLidas.error) throw naoLidas.error;

  return {
    nome: p.nome,
    iniciais: iniciais(p.nome),
    tempo_de_casa: tempoDeCasa(p.cliente_desde),
    aniversario_hoje: aniversarioHoje(p.data_nascimento),
    nao_lidas: naoLidas.count ?? 0,
    apolices_ativas: ou(ativas),
  };
}

export async function listarApolices(perfilId: string, pag: Paginacao) {
  const { from, to } = faixa(pag);
  const r = await supabaseAdmin()
    .from('apolice')
    .select(COLUNAS_APOLICE_LISTA, { count: 'exact' })
    .eq('perfil_id', perfilId)
    // Ordem alfabética do status põe ATIVA primeiro; dentro de cada, a mais recente.
    .order('status')
    .order('inicio_vigencia', { ascending: false })
    .range(from, to);
  return { itens: ou(r), total: r.count ?? 0 };
}

/** Detalhe da apólice. Coberturas são P2 (decisão 11): a lista vem vazia por enquanto. */
export async function buscarApolice(perfilId: string, id: string) {
  const r = await supabaseAdmin()
    .from('apolice')
    .select(COLUNAS_APOLICE)
    .eq('perfil_id', perfilId)
    .eq('id', id)
    .maybeSingle();
  const apolice = talvez(r);
  return apolice && { ...apolice, coberturas: [] as unknown[] };
}

/** URL assinada de 60 s para o PDF no bucket privado `apolices` (RF-01). */
export async function urlPdfApolice(perfilId: string, id: string) {
  const db = supabaseAdmin();
  const apolice = talvez<{ pdf_caminho: string | null }>(
    await db
      .from('apolice')
      .select('pdf_caminho')
      .eq('perfil_id', perfilId)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!apolice) return { encontrada: false as const };
  if (!apolice.pdf_caminho) return { encontrada: true as const, url: null };

  const VALIDADE = 60;
  const { data, error } = await db.storage
    .from('apolices')
    .createSignedUrl(apolice.pdf_caminho, VALIDADE);
  if (error) throw error;
  return {
    encontrada: true as const,
    url: data.signedUrl,
    expira_em: new Date(Date.now() + VALIDADE * 1000).toISOString(),
  };
}

/**
 * Contatos ativos do tipo pedido, filtrados pelos produtos das apólices ativas
 * do usuário (seção 6.6). Contato sem produto vale para todos. Sem apólice ativa:
 * todos os contatos de assistência (decisão 9), e de sinistro só os gerais.
 */
export async function listarContatos(perfilId: string, tipo: 'ASSISTENCIA_24H' | 'SINISTRO') {
  const db = supabaseAdmin();
  const produtos = [
    ...new Set(
      ou(
        await db
          .from('apolice')
          .select('produto')
          .eq('perfil_id', perfilId)
          .eq('status', 'ATIVA'),
      ).map((a) => a.produto as string),
    ),
  ];

  let q = db
    .from('contato_assistencia')
    .select('id, tipo, produto, rotulo, telefone, whatsapp')
    .eq('tipo', tipo)
    .eq('ativo', true)
    .order('rotulo');

  if (produtos.length) q = q.or(`produto.is.null,produto.in.(${produtos.join(',')})`);
  else if (tipo === 'SINISTRO') q = q.is('produto', null);

  return ou(await q);
}

export async function listarNotificacoes(
  perfilId: string,
  pag: Paginacao,
  opts: { naoLidas: boolean },
) {
  const { from, to } = faixa(pag);
  let q = supabaseAdmin()
    .from('notificacao')
    .select(COLUNAS_NOTIFICACAO, { count: 'exact' })
    .eq('perfil_id', perfilId);
  if (opts.naoLidas) q = q.is('lida_em', null);
  const r = await q.order('criado_em', { ascending: false }).range(from, to);
  return { itens: ou(r), total: r.count ?? 0 };
}

/** Marca como lida. Já lida mantém a data original (idempotente). null = não encontrada. */
export async function marcarNotificacaoLida(perfilId: string, id: string) {
  const db = supabaseAdmin();
  const atualizada = talvez(
    await db
      .from('notificacao')
      .update({ lida_em: new Date().toISOString() })
      .eq('perfil_id', perfilId)
      .eq('id', id)
      .is('lida_em', null)
      .select(COLUNAS_NOTIFICACAO)
      .maybeSingle(),
  );
  if (atualizada) return atualizada;

  return talvez(
    await db
      .from('notificacao')
      .select(COLUNAS_NOTIFICACAO)
      .eq('perfil_id', perfilId)
      .eq('id', id)
      .maybeSingle(),
  );
}
