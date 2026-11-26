import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// E-mail transacional (#71 confirmação de e-mail, #72 avisos por e-mail).

const env = vi.hoisted(() => ({
  atual: {} as Record<string, unknown>,
}));

vi.mock('@/lib/env', () => ({
  getEnv: () => ({ COOKIE_SECURE: true, CORS_ALLOWED_ORIGINS: [], ...env.atual }),
}));

// Supabase falso: cada teste diz o que cada chamada devolve.
const sb = vi.hoisted(() => {
  const consultas: Record<string, { data: unknown; error: unknown }> = {};
  const consulta = (tabela: string) => {
    const resultado = () => consultas[tabela] ?? { data: null, error: null };
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lte', 'order', 'limit']) q[m] = vi.fn(() => q);
    q.maybeSingle = vi.fn(async () => resultado());
    return q;
  };
  return {
    consultas,
    generateLink: vi.fn(),
    getUserById: vi.fn(),
    verifyOtp: vi.fn(),
    signInWithPassword: vi.fn(),
    rpc: vi.fn(),
    from: vi.fn((t: string) => consulta(t)),
  };
});

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: () => ({
    auth: { admin: { generateLink: sb.generateLink, getUserById: sb.getUserById } },
    rpc: sb.rpc,
    from: sb.from,
  }),
  supabaseAuth: () => ({ auth: { verifyOtp: sb.verifyOtp, signInWithPassword: sb.signInWithPassword } }),
}));

import {
  VALIDADE_MINUTOS,
  codigoConfirmacao,
  cotacaoRespondida,
  escapar,
  formatarReais,
  primeiroNome,
  redefinirSenha,
  statusSinistro,
} from '@/lib/email/modelos';
import { EmailIndisponivelError, enviarEmail } from '@/lib/email/cliente';
import {
  confirmarEmail,
  enviarCodigoConfirmacao,
  enviarLinkRedefinicao,
  reenviarCodigo,
} from '@/lib/services/confirmacao-email';
import { avisarPorEmail, enviarEmailsPendentes } from '@/lib/services/avisos-email';
import { confirmarEmailSchema, reenviarCodigoSchema } from '@/lib/schemas/conta';

const EMAIL = 'paulo.lima@email.com';
const RODAPE = 'Este é um e-mail automático, não responda. Para falar com a gente, use o app (aba Assistência).';

let logs: string[];
const fetchMock = vi.fn();

function respostaJson(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  env.atual = {};
  for (const k of Object.keys(sb.consultas)) delete sb.consultas[k];
  vi.clearAllMocks();
  logs = [];
  const guardar = (...a: unknown[]) => logs.push(a.map(String).join(' '));
  vi.spyOn(console, 'log').mockImplementation(guardar);
  vi.spyOn(console, 'error').mockImplementation(guardar);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function comResend() {
  env.atual = { RESEND_API_KEY: 're_teste', EMAIL_REMETENTE: 'BS Corretora <nao-responda@bsseguradora.online>' };
}

describe('#71 modelos de e-mail', () => {
  it('código de confirmação: código em destaque, validade, aviso de não compartilhar e rodapé', () => {
    const m = codigoConfirmacao({ codigo: '123456', nome: 'maria clara souza' });
    expect(m.assunto).toBe('Confirme seu e-mail — BS Corretora');
    expect(m.assunto).not.toContain('123456');
    expect(m.html).toContain('123456');
    expect(m.texto).toContain('123456');
    expect(m.html).toContain('Olá, Maria!');
    expect(m.html).toContain(`${VALIDADE_MINUTOS} minutos`);
    expect(m.html).toContain('Não compartilhe este código');
    for (const t of [m.html, m.texto]) {
      expect(t).toContain(RODAPE);
      expect(t).toContain('Você recebeu este e-mail porque tem conta no App do Segurado');
    }
    expect(m.html).toContain('display:none'); // preheader
  });

  it('sem nome, a saudação é só "Olá!"', () => {
    expect(codigoConfirmacao({ codigo: '111111' }).texto).toContain('Olá!');
    expect(primeiroNome('  ')).toBeNull();
    expect(primeiroNome('JOÃO silva')).toBe('João');
  });

  it('redefinição: botão e link escapados no HTML, link inteiro no texto', () => {
    const link = 'https://x.supabase.co/auth/v1/verify?token=abc&type=recovery&redirect_to=https://api/redefinir-senha';
    const m = redefinirSenha({ link });
    expect(m.assunto).toBe('Redefinir sua senha — BS Corretora');
    expect(m.html).toContain('token=abc&amp;type=recovery');
    expect(m.html).not.toContain('token=abc&type');
    expect(m.html).toContain('Criar senha nova');
    expect(m.texto).toContain(link);
  });

  it('escapa HTML vindo de fora, inclusive o nome', () => {
    expect(escapar(`<script>"a"&'b'</script>`)).toBe('&lt;script&gt;&quot;a&quot;&amp;&#39;b&#39;&lt;/script&gt;');
    const m = codigoConfirmacao({ codigo: '123456', nome: '<b>Ana</b> Souza' });
    expect(m.html).not.toContain('<b>');
    expect(m.html).toContain('&lt;b&gt;ana&lt;/b&gt;');
  });
});

describe('#72 modelos de aviso', () => {
  it('sinistro: protocolo, selo com texto e comentário citado e escapado', () => {
    const m = statusSinistro({
      protocolo: 'SIN-2026-000123',
      status: 'EM_ANALISE',
      comentario: 'Perícia <amanhã>.\nTraga o BO.',
      nome: 'Maria Souza',
    });
    expect(m.assunto).toBe('Sinistro SIN-2026-000123: em análise — BS Corretora');
    expect(m.html).toContain('SIN-2026-000123');
    expect(m.html).toContain('Em análise');
    expect(m.html).toContain('#fff4d6'); // selo âmbar
    expect(m.html).toContain('Comentário do analista');
    expect(m.html).toContain('Perícia &lt;amanhã&gt;.<br>Traga o BO.');
    expect(m.texto).toContain('Comentário do analista:\nPerícia <amanhã>.\nTraga o BO.');
    expect(m.html).toContain(RODAPE);
  });

  it('sinistro concluído tem selo verde; sem comentário não mostra o bloco', () => {
    const m = statusSinistro({ protocolo: 'SIN-2026-000124', status: 'CONCLUIDO', comentario: null });
    expect(m.html).toContain('Concluído');
    expect(m.html).toContain('#e3f4e8');
    expect(m.html).not.toContain('Comentário do analista');
  });

  it('cotação: produto, resposta escapada e valor em reais; sem valor, sem a linha', () => {
    const m = cotacaoRespondida({ produto: 'RESIDENCIAL', resposta: 'Plano <básico>.', valor: 478.8 });
    expect(m.assunto).toBe('Sua cotação de seguro Residencial foi respondida — BS Corretora');
    expect(m.html).toContain('Residencial');
    expect(m.html).toContain('Plano &lt;básico&gt;.');
    expect(m.html).toContain('R$ 478,80');
    expect(m.texto).toContain('Valor estimado: R$ 478,80');
    expect(cotacaoRespondida({ produto: 'VIDA', resposta: 'Sob consulta.', valor: null }).html).not.toContain('Valor estimado');
    expect(formatarReais(1234.5)).toBe('R$ 1.234,50');
  });
});

describe('#71 cliente Resend', () => {
  const email = { para: EMAIL, tipo: 'codigo-confirmacao', ...codigoConfirmacao({ codigo: '654321' }) };

  it('sem RESEND_API_KEY só registra o tipo no log, sem destinatário nem código', async () => {
    expect(await enviarEmail(email)).toEqual({ modo: 'log' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs.join('\n')).toContain('codigo-confirmacao');
    expect(logs.join('\n')).not.toContain(EMAIL);
    expect(logs.join('\n')).not.toContain('654321');
  });

  it('com a chave, envia remetente, destinatário, HTML e texto ao Resend', async () => {
    comResend();
    fetchMock.mockResolvedValue(respostaJson(200, { id: 'e-1' }));
    expect(await enviarEmail(email)).toEqual({ modo: 'resend', id: 'e-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_teste');
    const corpo = JSON.parse(init.body);
    expect(corpo).toMatchObject({
      from: 'BS Corretora <nao-responda@bsseguradora.online>',
      to: [EMAIL],
      subject: 'Confirme seu e-mail — BS Corretora',
    });
    expect(corpo.text).toContain('654321');
    expect(corpo.html).toContain('654321');
  });

  it('recusa do Resend vira EmailIndisponivelError sem o e-mail na mensagem', async () => {
    comResend();
    fetchMock.mockResolvedValue(respostaJson(422, { name: 'validation_error', message: `bad ${EMAIL}` }));
    const erro = await enviarEmail(email).catch((e) => e);
    expect(erro).toBeInstanceOf(EmailIndisponivelError);
    expect(erro.message).toContain('422');
    expect(erro.message).not.toContain(EMAIL);
  });

  it('falha de rede vira EmailIndisponivelError redigido', async () => {
    comResend();
    fetchMock.mockRejectedValue(new Error(`timeout para ${EMAIL}`));
    const erro = await enviarEmail(email).catch((e) => e);
    expect(erro).toBeInstanceOf(EmailIndisponivelError);
    expect(erro.message).toContain('[email]');
    expect(erro.message).not.toContain(EMAIL);
  });
});

describe('#71 entradas', () => {
  it('código tem exatamente 6 dígitos; e-mail normalizado', () => {
    expect(confirmarEmailSchema.parse({ email: ' Paulo@Email.com ', codigo: ' 012345 ' })).toEqual({
      email: 'paulo@email.com',
      codigo: '012345',
    });
    for (const codigo of ['12345', '1234567', 'abcdef', '12 456']) {
      expect(confirmarEmailSchema.safeParse({ email: EMAIL, codigo }).success).toBe(false);
    }
    expect(reenviarCodigoSchema.safeParse({ email: 'x' }).success).toBe(false);
  });
});

describe('#71 código de confirmação', () => {
  it('gera o código pelo Supabase (signup) e manda pelo nosso e-mail', async () => {
    sb.generateLink.mockResolvedValue({ data: { properties: { email_otp: '112233' } }, error: null });
    comResend();
    fetchMock.mockResolvedValue(respostaJson(200, { id: 'e-2' }));
    expect(await enviarCodigoConfirmacao(EMAIL)).toBe(true);
    expect(sb.generateLink).toHaveBeenCalledWith(expect.objectContaining({ type: 'signup', email: EMAIL }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('112233');
  });

  it('conta já confirmada (email_exists): não envia nada nem registra erro', async () => {
    sb.generateLink.mockResolvedValue({ data: { properties: null, user: null }, error: { code: 'email_exists', status: 422 } });
    expect(await enviarCodigoConfirmacao(EMAIL)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logs).toHaveLength(0);
  });

  it('falha do Resend não lança e o log não tem o e-mail nem o código', async () => {
    sb.generateLink.mockResolvedValue({ data: { properties: { email_otp: '998877' } }, error: null });
    comResend();
    fetchMock.mockResolvedValue(respostaJson(500, {}));
    expect(await enviarCodigoConfirmacao(EMAIL)).toBe(false);
    expect(logs.join('\n')).not.toContain(EMAIL);
    expect(logs.join('\n')).not.toContain('998877');
  });

  it('reenvio só gera código para conta que aguarda confirmação', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: null });
    await reenviarCodigo(EMAIL);
    expect(sb.rpc).toHaveBeenCalledWith('conta_aguardando_confirmacao', { p_email: EMAIL });
    expect(sb.generateLink).not.toHaveBeenCalled();

    sb.rpc.mockResolvedValue({ data: 'Paulo Lima', error: null });
    sb.generateLink.mockResolvedValue({ data: { properties: { email_otp: '445566' } }, error: null });
    comResend();
    fetchMock.mockResolvedValue(respostaJson(200, { id: 'e-3' }));
    await reenviarCodigo(EMAIL);
    expect(sb.generateLink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('Olá, Paulo!');
  });

  it('reenvio com banco fora não lança', async () => {
    sb.rpc.mockResolvedValue({ data: null, error: { message: 'down' } });
    await expect(reenviarCodigo(EMAIL)).resolves.toBeUndefined();
    expect(sb.generateLink).not.toHaveBeenCalled();
  });

  it('confirmar: código certo devolve a sessão; errado é CODIGO_INVALIDO; Auth fora é INDISPONIVEL', async () => {
    const session = { access_token: 'a', refresh_token: 'r', expires_in: 3600 };
    sb.verifyOtp.mockResolvedValueOnce({ data: { session, user: { id: 'u1' } }, error: null });
    expect(await confirmarEmail(EMAIL, '123456')).toMatchObject({ ok: true, session });
    expect(sb.verifyOtp).toHaveBeenCalledWith({ email: EMAIL, token: '123456', type: 'signup' });

    sb.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { status: 403, code: 'otp_expired', name: 'AuthApiError' } });
    expect(await confirmarEmail(EMAIL, '000000')).toEqual({ ok: false, motivo: 'CODIGO_INVALIDO' });

    sb.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { status: 0, name: 'AuthRetryableFetchError' } });
    expect(await confirmarEmail(EMAIL, '000000')).toEqual({ ok: false, motivo: 'INDISPONIVEL' });
  });
});

describe('#71 esqueci a senha', () => {
  it('link de recuperação do Supabase com o redirect para /redefinir-senha, enviado por nós', async () => {
    sb.generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://sb/verify?token=t&type=recovery' } }, error: null });
    expect(await enviarLinkRedefinicao(EMAIL, 'https://api/redefinir-senha')).toBe(true);
    expect(sb.generateLink).toHaveBeenCalledWith({
      type: 'recovery',
      email: EMAIL,
      options: { redirectTo: 'https://api/redefinir-senha' },
    });
    expect(logs.join('\n')).toContain('redefinir-senha');
  });

  it('e-mail sem conta (404) não envia e não registra erro', async () => {
    sb.generateLink.mockResolvedValue({ data: { properties: null }, error: { status: 404, code: 'user_not_found' } });
    expect(await enviarLinkRedefinicao(EMAIL, 'https://api/redefinir-senha')).toBe(false);
    expect(logs).toHaveLength(0);
  });
});

describe('#72 fila de avisos por e-mail', () => {
  const sinistro = {
    id: 'n1',
    perfil_id: 'p1',
    destino_tipo: 'SINISTRO',
    destino_id: 's1',
    criado_em: '2026-11-25T12:00:00Z',
    email_tentativas: 1,
  };
  const cotacao = { ...sinistro, id: 'n2', destino_tipo: 'COTACAO', destino_id: 'c1' };

  function fila(...itens: unknown[]) {
    sb.rpc.mockImplementation(async (nome: string) =>
      nome === 'reservar_email_pendentes' ? { data: itens, error: null } : { data: null, error: null },
    );
  }

  beforeEach(() => {
    sb.consultas.sinistro = { data: { protocolo: 'SIN-2026-000123' }, error: null };
    sb.consultas.sinistro_evento = { data: { status: 'EM_ANALISE', comentario: 'Perícia marcada.' }, error: null };
    sb.consultas.perfil = { data: { nome: 'Maria Souza' }, error: null };
    sb.consultas.cotacao = { data: { produto: 'AUTO', resposta: 'R$ 100/mês.', valor_estimado: '1200.00' }, error: null };
    sb.getUserById.mockResolvedValue({ data: { user: { email: EMAIL } }, error: null });
    comResend();
    fetchMock.mockResolvedValue(respostaJson(200, { id: 'e' }));
  });

  it('reserva, monta e envia sinistro e cotação para o e-mail do segurado', async () => {
    fila(sinistro, cotacao);
    const r = await enviarEmailsPendentes({ intervaloMs: 0 });
    expect(r).toEqual({ processadas: 2, enviados: 2, sem_destinatario: 0, devolvidas: 0, desistidas: 0 });
    expect(sb.rpc).toHaveBeenCalledWith('reservar_email_pendentes', { p_limite: 50, p_destino_id: null });
    const [primeiro, segundo] = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));
    expect(primeiro.to).toEqual([EMAIL]);
    expect(primeiro.subject).toBe('Sinistro SIN-2026-000123: em análise — BS Corretora');
    expect(primeiro.text).toContain('Olá, Maria!');
    expect(primeiro.text).toContain('Perícia marcada.');
    expect(segundo.text).toContain('R$ 1.200,00');
    expect(sb.rpc).not.toHaveBeenCalledWith('liberar_email', expect.anything());
  });

  it('falha no envio devolve para a fila; na 3ª tentativa desiste', async () => {
    fila(sinistro, { ...cotacao, email_tentativas: 3 });
    fetchMock.mockResolvedValue(respostaJson(503, {}));
    const r = await enviarEmailsPendentes({ intervaloMs: 0 });
    expect(r).toMatchObject({ processadas: 2, enviados: 0, devolvidas: 1, desistidas: 1 });
    expect(sb.rpc).toHaveBeenCalledWith('liberar_email', { p_ids: ['n1', 'n2'] });
    expect(logs.join('\n')).toContain('sai da fila');
    expect(logs.join('\n')).not.toContain(EMAIL);
  });

  it('segurado sem e-mail ou registro apagado não volta para a fila', async () => {
    fila(sinistro);
    sb.getUserById.mockResolvedValue({ data: { user: null }, error: { status: 404 } });
    expect(await enviarEmailsPendentes({ intervaloMs: 0 })).toMatchObject({ sem_destinatario: 1, devolvidas: 0 });

    fila(cotacao);
    sb.consultas.cotacao = { data: null, error: null };
    expect(await enviarEmailsPendentes({ intervaloMs: 0 })).toMatchObject({ sem_destinatario: 1 });
  });

  it('envio na hora filtra pelo destino e nunca lança', async () => {
    fila(sinistro);
    await avisarPorEmail('s1');
    expect(sb.rpc).toHaveBeenCalledWith('reservar_email_pendentes', { p_limite: 5, p_destino_id: 's1' });

    sb.rpc.mockResolvedValue({ data: null, error: { message: 'banco fora' } });
    await expect(avisarPorEmail('s1')).resolves.toBeUndefined();
  });

  it('espera entre um envio e outro (limite de 2 por segundo do Resend)', async () => {
    vi.useFakeTimers();
    try {
      fila(sinistro, cotacao);
      const p = enviarEmailsPendentes({ intervaloMs: 550 });
      await vi.advanceTimersByTimeAsync(549);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('#71 rotas de conta', () => {
  const req = (rota: string, corpo: unknown, ip: string) =>
    new NextRequest(`http://localhost/api/v1${rota}`, {
      method: 'POST',
      body: JSON.stringify(corpo),
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    });

  it('login com e-mail não confirmado → 403 EMAIL_NAO_CONFIRMADO', async () => {
    const { POST } = await import('@/app/api/v1/auth/login/route');
    sb.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { status: 400, code: 'email_not_confirmed', name: 'AuthApiError' },
    });
    const r = await POST(req('/auth/login', { email: EMAIL, senha: 'Senha@123' }, '10.1.0.1'));
    expect(r.status).toBe(403);
    expect((await r.json()).erro).toBe('EMAIL_NAO_CONFIRMADO');
  });

  it('confirmar-email: certo → 200 com tokens e cookies; errado → 400 CODIGO_INVALIDO', async () => {
    const { POST } = await import('@/app/api/v1/auth/confirmar-email/route');
    sb.verifyOtp.mockResolvedValueOnce({
      data: {
        session: { access_token: 'acc', refresh_token: 'ref', expires_in: 3600, expires_at: 1 },
        user: { id: 'u1', email: EMAIL },
      },
      error: null,
    });
    const ok = await POST(req('/auth/confirmar-email', { email: EMAIL, codigo: '123456' }, '10.1.0.2'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ id: 'u1', access_token: 'acc', refresh_token: 'ref' });
    expect(ok.headers.get('set-cookie')).toContain('access_token=acc');

    sb.verifyOtp.mockResolvedValueOnce({ data: { session: null, user: null }, error: { status: 403, code: 'otp_expired' } });
    const errado = await POST(req('/auth/confirmar-email', { email: EMAIL, codigo: '000000' }, '10.1.0.2'));
    expect(errado.status).toBe(400);
    expect(await errado.json()).toMatchObject({ erro: 'CODIGO_INVALIDO', campos: { codigo: expect.any(String) } });
  });

  it('confirmar-email: 5 palpites por e-mail a cada 10 minutos, mesmo trocando de IP', async () => {
    const { POST } = await import('@/app/api/v1/auth/confirmar-email/route');
    sb.verifyOtp.mockResolvedValue({ data: { session: null, user: null }, error: { status: 403 } });
    const alvo = 'alvo.limite@email.com';
    for (let i = 0; i < 5; i++) {
      expect((await POST(req('/auth/confirmar-email', { email: alvo, codigo: '000000' }, `10.2.0.${i}`))).status).toBe(400);
    }
    const r = await POST(req('/auth/confirmar-email', { email: alvo, codigo: '000000' }, '10.2.0.9'));
    expect(r.status).toBe(429);
  });

  it('reenviar-codigo → 204 exista a conta ou não; entrada inválida → 400', async () => {
    const { POST } = await import('@/app/api/v1/auth/reenviar-codigo/route');
    sb.rpc.mockResolvedValue({ data: null, error: null });
    expect((await POST(req('/auth/reenviar-codigo', { email: 'ninguem@email.com' }, '10.1.0.3'))).status).toBe(204);
    expect((await POST(req('/auth/reenviar-codigo', { email: 'x' }, '10.1.0.3'))).status).toBe(400);
  });

  it('esqueci-senha → 204 e o link aponta para /redefinir-senha da própria API', async () => {
    const { POST } = await import('@/app/api/v1/auth/esqueci-senha/route');
    sb.generateLink.mockResolvedValue({ data: { properties: { action_link: 'https://sb/verify' } }, error: null });
    expect((await POST(req('/auth/esqueci-senha', { email: EMAIL }, '10.1.0.4'))).status).toBe(204);
    expect(sb.generateLink.mock.calls[0][0].options.redirectTo).toMatch(/\/redefinir-senha$/);
  });
});
