import { supabaseAdmin } from '@/lib/supabase/server';
import { enviarEmail } from '@/lib/email/cliente';
import { cotacaoRespondida, statusSinistro, type Mensagem } from '@/lib/email/modelos';
import { descreverErro } from '@/lib/formato';

// Avisos por e-mail (#72): mudança de status do sinistro e cotação respondida.
//
// A notificação nasce no banco (admin_alterar_status_sinistro, admin_responder_cotacao) com
// email_enviado_em nulo. A rota do admin tenta enviar na hora; o que falhar fica na fila e o job
// de 15 minutos (POST /internal/email/pendentes) tenta de novo, até MAX_TENTATIVAS no total.

/** Igual ao `email_tentativas < 3` de public.reservar_email_pendentes. */
export const MAX_TENTATIVAS = 3;

/** O Resend aceita 2 requisições por segundo na conta padrão. */
const INTERVALO_MS = 550;

type Reservada = {
  id: string;
  perfil_id: string;
  destino_tipo: 'SINISTRO' | 'COTACAO';
  destino_id: string;
  criado_em: string;
  email_tentativas: number;
};

export type ResumoEmail = {
  processadas: number;
  enviados: number;
  sem_destinatario: number;
  devolvidas: number;
  desistidas: number;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Monta o e-mail a partir do sinistro ou da cotação. null = o registro não existe mais. */
async function montarMensagem(n: Reservada): Promise<Mensagem | null> {
  const db = supabaseAdmin();
  const nome = await nomeDo(n.perfil_id);
  if (n.destino_tipo === 'SINISTRO') {
    const sinistro = await db
      .from('sinistro')
      .select('protocolo')
      .eq('id', n.destino_id)
      .maybeSingle();
    if (sinistro.error) throw sinistro.error;
    if (!sinistro.data) return null;
    // O evento que gerou esta notificação: gravado na mesma transação (mesmo now()), então é o
    // mais recente até o criado_em da notificação, mesmo que o status tenha mudado de novo depois.
    const evento = await db
      .from('sinistro_evento')
      .select('status, comentario')
      .eq('sinistro_id', n.destino_id)
      .lte('criado_em', n.criado_em)
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (evento.error) throw evento.error;
    if (!evento.data) return null;
    return statusSinistro({
      protocolo: sinistro.data.protocolo,
      status: evento.data.status,
      comentario: evento.data.comentario,
      nome,
    });
  }

  const cotacao = await db
    .from('cotacao')
    .select('produto, resposta, valor_estimado')
    .eq('id', n.destino_id)
    .maybeSingle();
  if (cotacao.error) throw cotacao.error;
  if (!cotacao.data?.resposta) return null;
  return cotacaoRespondida({
    produto: cotacao.data.produto,
    resposta: cotacao.data.resposta,
    valor: cotacao.data.valor_estimado == null ? null : Number(cotacao.data.valor_estimado),
    nome,
  });
}

/** Nome do segurado para a saudação; sem ele, o e-mail sai com "Olá!". */
async function nomeDo(perfilId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from('perfil').select('nome').eq('id', perfilId).maybeSingle();
  return (data as { nome?: string } | null)?.nome ?? null;
}

/** E-mail do segurado, pelo Auth admin. null = usuário sem e-mail ou apagado. */
async function emailDo(perfilId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().auth.admin.getUserById(perfilId);
  if (error) {
    if (error.status === 404) return null;
    throw error;
  }
  return data.user?.email ?? null;
}

/**
 * Envia os e-mails da fila. Com `destinoId`, só os daquele sinistro ou cotação (envio na hora).
 *
 * 1. Reserva no banco (marca email_enviado_em e soma a tentativa; SKIP LOCKED evita envio em dobro).
 * 2. Monta o e-mail com os dados atuais do sinistro ou da cotação e busca o e-mail do segurado.
 * 3. Falha (Resend, rede, banco): a notificação volta para a fila, se ainda tiver tentativa.
 */
export async function enviarEmailsPendentes(
  opcoes: { limite?: number; destinoId?: string; intervaloMs?: number } = {},
): Promise<ResumoEmail> {
  const { limite = 50, destinoId, intervaloMs = INTERVALO_MS } = opcoes;
  const db = supabaseAdmin();

  const reservadas = await db.rpc('reservar_email_pendentes', {
    p_limite: limite,
    p_destino_id: destinoId ?? null,
  });
  if (reservadas.error) throw reservadas.error;
  const fila = (reservadas.data ?? []) as Reservada[];

  const resumo: ResumoEmail = {
    processadas: fila.length,
    enviados: 0,
    sem_destinatario: 0,
    devolvidas: 0,
    desistidas: 0,
  };
  const devolver: string[] = [];

  for (const [i, n] of fila.entries()) {
    if (i > 0 && intervaloMs > 0) await esperar(intervaloMs);
    try {
      const mensagem = await montarMensagem(n);
      const para = mensagem ? await emailDo(n.perfil_id) : null;
      if (!mensagem || !para) {
        resumo.sem_destinatario++;
        continue;
      }
      await enviarEmail({ para, tipo: `aviso-${n.destino_tipo.toLowerCase()}`, ...mensagem });
      resumo.enviados++;
    } catch (e) {
      const desiste = n.email_tentativas >= MAX_TENTATIVAS;
      console.error(
        `[email] aviso ${n.id} falhou na tentativa ${n.email_tentativas}, ` +
          `${desiste ? 'sai da fila' : 'volta para a fila'}:`,
        descreverErro(e),
      );
      devolver.push(n.id);
      if (desiste) resumo.desistidas++;
    }
  }

  if (devolver.length > 0) {
    // Também as desistidas: email_enviado_em volta a nulo (não foi enviado), e o
    // email_tentativas = 3 é o que as tira da fila.
    const r = await db.rpc('liberar_email', { p_ids: devolver });
    if (r.error) throw r.error;
    resumo.devolvidas = devolver.length - resumo.desistidas;
  }
  return resumo;
}

/**
 * Envio na hora, pela rota do admin. Nunca lança: o status do sinistro e a resposta da cotação já
 * foram gravados e não podem falhar por causa do e-mail. O que não sair fica para o job.
 */
export async function avisarPorEmail(destinoId: string): Promise<void> {
  try {
    await enviarEmailsPendentes({ destinoId, limite: 5, intervaloMs: 0 });
  } catch (e) {
    console.error('[email] envio na hora falhou, fica para o job:', descreverErro(e));
  }
}
