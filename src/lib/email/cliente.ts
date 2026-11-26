import { getEnv } from '@/lib/env';
import { redigir } from '@/lib/formato';

// Cliente do Resend (#71, #72): uma chamada HTTP, sem SDK.
// Documentação: https://resend.com/docs/api-reference/emails/send-email

const RESEND_URL = 'https://api.resend.com/emails';

export type Email = {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  /** Rótulo curto para o log (ex.: "codigo-confirmacao"). Nunca o assunto nem o destinatário. */
  tipo: string;
};

export type ResultadoEnvio = { modo: 'resend'; id: string | null } | { modo: 'log' };

/** Falha do provedor de e-mail (rede, 4xx, 5xx). A mensagem já sai sem dado pessoal. */
export class EmailIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'EmailIndisponivelError';
  }
}

/**
 * Envia um e-mail pelo Resend. Sem `RESEND_API_KEY` (desenvolvimento e CI), não envia nada: só
 * registra no log o tipo do e-mail, sem destinatário, código nem link.
 *
 * Lança EmailIndisponivelError quando o Resend recusa ou não responde.
 */
export async function enviarEmail(email: Email): Promise<ResultadoEnvio> {
  const { RESEND_API_KEY, EMAIL_REMETENTE } = getEnv();
  if (!RESEND_API_KEY) {
    console.log(`[email] sem RESEND_API_KEY: "${email.tipo}" não enviado (modo só-log)`);
    return { modo: 'log' };
  }

  let r: Response;
  try {
    r = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: EMAIL_REMETENTE,
        to: [email.para],
        subject: email.assunto,
        html: email.html,
        text: email.texto,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new EmailIndisponivelError(
      `Resend sem resposta: ${redigir(e instanceof Error ? e.message : String(e))}`,
    );
  }

  if (!r.ok) {
    // O corpo de erro do Resend pode citar o destinatário: só o nome do erro vai para a mensagem.
    const corpo = (await r.json().catch(() => null)) as { name?: string } | null;
    throw new EmailIndisponivelError(`Resend respondeu ${r.status} ${redigir(corpo?.name ?? '')}`.trim());
  }
  const corpo = (await r.json().catch(() => null)) as { id?: string } | null;
  return { modo: 'resend', id: corpo?.id ?? null };
}
