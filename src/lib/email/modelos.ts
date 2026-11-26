// Modelos dos e-mails transacionais (#71, #72).
//
// HTML de e-mail compatível com Gmail e Outlook: layout em <table>, CSS inline, sem fonte externa
// nem imagem, cartão de 600px centralizado. Cada modelo devolve também a versão em texto puro e um
// preheader (o texto de prévia que a caixa de entrada mostra ao lado do assunto). Tudo que vem do
// usuário ou do banco (nome, comentário, resposta, link) passa por `escapar`.
//
// Prévia no navegador: `npm run emails:previa` grava os modelos em tmp/emails/.

export type Mensagem = { assunto: string; html: string; texto: string };

/**
 * Validade do código e do link, em minutos. É o `otp_expiry` do Supabase Auth (3600 s em
 * supabase/config.toml e o padrão do Supabase Cloud). Mudou lá, muda aqui.
 */
export const VALIDADE_MINUTOS = 60;

const MARCA = 'BS Corretora';
const PRODUTO_APP = 'App do Segurado';

const COR = {
  fundo: '#f4f6f8',
  cartao: '#ffffff',
  borda: '#dde3e8',
  marca: '#0b3d5c',
  texto: '#1f2933',
  textoSuave: '#4a5763',
  destaque: '#eef3f7',
};

const FONTE = 'Arial,Helvetica,sans-serif';

/** Selo de status: cor de fundo e de texto (o texto sempre diz o status; a cor só reforça). */
const SELOS: Record<string, { rotulo: string; fundo: string; texto: string; borda: string }> = {
  ABERTO: { rotulo: 'Aberto', fundo: '#e8eef4', texto: '#0b3d5c', borda: '#b9c9d8' },
  EM_ANALISE: { rotulo: 'Em análise', fundo: '#fff4d6', texto: '#7a4b00', borda: '#f0d58a' },
  CONCLUIDO: { rotulo: 'Concluído', fundo: '#e3f4e8', texto: '#1d5e33', borda: '#a9d9b8' },
};

const PRODUTOS: Record<string, string> = {
  AUTO: 'Auto',
  RESIDENCIAL: 'Residencial',
  VIDA: 'Vida',
  EMPRESARIAL: 'Empresarial',
};

export function escapar(valor: string): string {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "maria clara souza" → "Maria". Sem nome, null (a saudação fica só "Olá!"). */
export function primeiroNome(nome: string | null | undefined): string | null {
  const primeiro = nome?.trim().split(/\s+/)[0];
  if (!primeiro) return null;
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR');
}

/** 478.8 → "R$ 478,80" (espaço comum no lugar do não separável, para o texto puro). */
export function formatarReais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(valor)
    .replace(/ /g, ' ');
}

// ----- Blocos de HTML -------------------------------------------------------------------------

const P = `margin:0 0 16px;font-family:${FONTE};font-size:16px;line-height:1.5;color:${COR.texto}`;

function paragrafo(html: string): string {
  return `<p style="${P}">${html}</p>`;
}

/** Texto livre (comentário, resposta): escapa e mantém as quebras de linha. */
function textoLivre(texto: string): string {
  return texto
    .trim()
    .split(/\n{2,}/)
    .map((p) => escapar(p).replace(/\n/g, '<br>'))
    .join('<br><br>');
}

function saudacao(nome: string | null | undefined): string {
  const primeiro = primeiroNome(nome);
  return primeiro ? `Olá, ${primeiro}!` : 'Olá!';
}

function codigoEmDestaque(codigo: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
<tr><td align="center" style="background:${COR.destaque};border:2px dashed #9fb3c4;border-radius:8px;padding:20px 12px">
<span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:${COR.marca}">${escapar(codigo)}</span>
</td></tr>
</table>`;
}

/** Botão "à prova de Outlook": tabela com fundo na célula e o link ocupando o botão inteiro. */
function botao(rotulo: string, link: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
<tr><td align="center" bgcolor="${COR.marca}" style="border-radius:6px;background:${COR.marca}">
<a href="${escapar(link)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${FONTE};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:6px">${escapar(rotulo)}</a>
</td></tr>
</table>`;
}

function selo(status: string): string {
  const s = SELOS[status] ?? { rotulo: status, fundo: COR.destaque, texto: COR.marca, borda: COR.borda };
  return `<span style="display:inline-block;padding:4px 12px;border:1px solid ${s.borda};border-radius:999px;background:${s.fundo};color:${s.texto};font-family:${FONTE};font-size:15px;font-weight:700;line-height:1.5">${escapar(s.rotulo)}</span>`;
}

/** Quadro de dados: pares rótulo/valor (o valor já vem em HTML). */
function quadro(linhas: [string, string][]): string {
  const tr = linhas
    .map(
      ([rotulo, valor], i) => `<tr>
<td style="padding:12px 16px;${i ? `border-top:1px solid ${COR.borda};` : ''}font-family:${FONTE};font-size:15px;line-height:1.5;color:${COR.textoSuave};width:40%;vertical-align:middle">${escapar(rotulo)}</td>
<td style="padding:12px 16px;${i ? `border-top:1px solid ${COR.borda};` : ''}font-family:${FONTE};font-size:16px;line-height:1.5;color:${COR.texto};font-weight:700;vertical-align:middle">${valor}</td>
</tr>`,
    )
    .join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;border:1px solid ${COR.borda};border-radius:8px;border-collapse:separate">
${tr}
</table>`;
}

/** Citação (comentário do analista, resposta da corretora). */
function citacao(titulo: string, texto: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px">
<tr><td style="border-left:4px solid ${COR.marca};background:${COR.destaque};padding:14px 18px;border-radius:0 6px 6px 0">
<p style="margin:0 0 6px;font-family:${FONTE};font-size:15px;font-weight:700;line-height:1.5;color:${COR.marca}">${escapar(titulo)}</p>
<p style="margin:0;font-family:${FONTE};font-size:16px;line-height:1.5;color:${COR.texto}">${textoLivre(texto)}</p>
</td></tr>
</table>`;
}

function montar(d: { titulo: string; preheader: string; corpo: string }): string {
  const rodape = `<p style="margin:0 0 8px;font-family:${FONTE};font-size:14px;line-height:1.5;color:${COR.textoSuave}">Este é um e-mail automático, não responda. Para falar com a gente, use o app (aba Assistência).</p>
<p style="margin:0;font-family:${FONTE};font-size:13px;line-height:1.5;color:${COR.textoSuave}">Você recebeu este e-mail porque tem conta no ${PRODUTO_APP} da ${MARCA}.</p>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${escapar(d.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:${COR.fundo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapar(d.preheader)}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR.fundo}">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:${COR.cartao};border:1px solid ${COR.borda};border-radius:8px;border-collapse:separate">
<tr><td bgcolor="${COR.marca}" style="background:${COR.marca};border-radius:8px 8px 0 0;padding:24px 32px">
<p style="margin:0;font-family:${FONTE};font-size:22px;font-weight:700;line-height:1.3;color:#ffffff">${MARCA}</p>
<p style="margin:4px 0 0;font-family:${FONTE};font-size:15px;font-weight:600;line-height:1.5;color:#d6e4ee">${PRODUTO_APP}</p>
</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-family:${FONTE};font-size:22px;font-weight:700;line-height:1.3;color:${COR.marca}">${escapar(d.titulo)}</h1>
${d.corpo}
</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid ${COR.borda};background:#fafbfc;border-radius:0 0 8px 8px">
${rodape}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function textoPuro(titulo: string, linhas: string[]): string {
  return [
    `${MARCA} · ${PRODUTO_APP}`,
    '',
    titulo,
    '',
    ...linhas,
    '',
    '--',
    'Este é um e-mail automático, não responda. Para falar com a gente, use o app (aba Assistência).',
    `Você recebeu este e-mail porque tem conta no ${PRODUTO_APP} da ${MARCA}.`,
  ].join('\n');
}

// ----- Modelos --------------------------------------------------------------------------------

/** Código de 6 dígitos para confirmar o e-mail do cadastro. O código NUNCA vai no assunto. */
export function codigoConfirmacao(d: { codigo: string; nome?: string | null }): Mensagem {
  const titulo = 'Confirme seu e-mail';
  const corpo = [
    paragrafo(escapar(saudacao(d.nome))),
    paragrafo('Para terminar seu cadastro, digite este código no app:'),
    codigoEmDestaque(d.codigo),
    paragrafo(
      `O código é válido por <strong>${VALIDADE_MINUTOS} minutos</strong> e só pode ser usado uma vez. ` +
        '<strong>Não compartilhe este código</strong> com ninguém: a nossa equipe nunca pede.',
    ),
    paragrafo(`Se você não criou uma conta na ${MARCA}, ignore este e-mail.`),
  ].join('\n');
  return {
    assunto: `Confirme seu e-mail — ${MARCA}`,
    html: montar({ titulo, preheader: 'Use o código deste e-mail para terminar seu cadastro no app.', corpo }),
    texto: textoPuro(titulo, [
      saudacao(d.nome),
      '',
      'Para terminar seu cadastro, digite este código no app:',
      '',
      `    ${d.codigo}`,
      '',
      `O código é válido por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.`,
      'Não compartilhe este código com ninguém: a nossa equipe nunca pede.',
      '',
      `Se você não criou uma conta na ${MARCA}, ignore este e-mail.`,
    ]),
  };
}

/** Link de redefinição de senha (abre /redefinir-senha depois de passar pelo Supabase Auth). */
export function redefinirSenha(d: { link: string; nome?: string | null }): Mensagem {
  const titulo = 'Redefinir sua senha';
  const corpo = [
    paragrafo(escapar(saudacao(d.nome))),
    paragrafo('Recebemos um pedido para redefinir a senha da sua conta. Toque no botão para criar uma senha nova:'),
    botao('Criar senha nova', d.link),
    paragrafo(`O link é válido por <strong>${VALIDADE_MINUTOS} minutos</strong> e só pode ser usado uma vez.`),
    paragrafo('Se você não pediu, ignore este e-mail: sua senha continua a mesma.'),
    `<p style="margin:0;font-family:${FONTE};font-size:15px;line-height:1.5;color:${COR.textoSuave}">Se o botão não abrir, copie e cole este endereço no navegador:<br><a href="${escapar(d.link)}" style="color:${COR.marca};word-break:break-all">${escapar(d.link)}</a></p>`,
  ].join('\n');
  return {
    assunto: `Redefinir sua senha — ${MARCA}`,
    html: montar({ titulo, preheader: 'Crie uma senha nova para entrar no app.', corpo }),
    texto: textoPuro(titulo, [
      saudacao(d.nome),
      '',
      'Recebemos um pedido para redefinir a senha da sua conta. Abra o link para criar uma senha nova:',
      '',
      d.link,
      '',
      `O link é válido por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.`,
      'Se você não pediu, ignore este e-mail: sua senha continua a mesma.',
    ]),
  };
}

/** Mudança de status do sinistro: protocolo, selo do status e comentário do analista. */
export function statusSinistro(d: {
  protocolo: string;
  status: string;
  comentario: string | null;
  nome?: string | null;
}): Mensagem {
  const rotulo = SELOS[d.status]?.rotulo ?? d.status;
  const comentario = d.comentario?.trim();
  const titulo = 'Seu sinistro foi atualizado';
  const corpo = [
    paragrafo(escapar(saudacao(d.nome))),
    paragrafo('O status do seu sinistro mudou. Veja o resumo:'),
    quadro([
      ['Protocolo', `<span style="font-family:'Courier New',Courier,monospace;font-size:17px;letter-spacing:1px">${escapar(d.protocolo)}</span>`],
      ['Status', selo(d.status)],
    ]),
    comentario ? citacao('Comentário do analista', comentario) : '',
    paragrafo('Acompanhe a linha do tempo completa na aba <strong>Sinistro</strong> do app.'),
  ]
    .filter(Boolean)
    .join('\n');
  return {
    assunto: `Sinistro ${d.protocolo}: ${rotulo.toLowerCase()} — ${MARCA}`,
    html: montar({ titulo, preheader: `O sinistro ${d.protocolo} agora está: ${rotulo}.`, corpo }),
    texto: textoPuro(titulo, [
      saudacao(d.nome),
      '',
      'O status do seu sinistro mudou.',
      '',
      `Protocolo: ${d.protocolo}`,
      `Status: ${rotulo}`,
      ...(comentario ? ['', 'Comentário do analista:', comentario] : []),
      '',
      'Acompanhe a linha do tempo completa na aba Sinistro do app.',
    ]),
  };
}

/** Cotação respondida: produto, resposta da corretora e valor estimado. */
export function cotacaoRespondida(d: {
  produto: string;
  resposta: string;
  valor: number | null;
  nome?: string | null;
}): Mensagem {
  const produto = PRODUTOS[d.produto] ?? d.produto;
  const valor = d.valor != null ? formatarReais(d.valor) : null;
  const titulo = 'Sua cotação foi respondida';
  const linhas: [string, string][] = [['Seguro', escapar(produto)]];
  if (valor) linhas.push(['Valor estimado', `<span style="font-size:18px;color:${COR.marca}">${escapar(valor)}</span>`]);
  const corpo = [
    paragrafo(escapar(saudacao(d.nome))),
    paragrafo('A corretora respondeu o seu pedido de cotação:'),
    quadro(linhas),
    citacao('Resposta da corretora', d.resposta),
    paragrafo('Veja os detalhes e fale com a gente pela aba <strong>Cotação</strong> do app.'),
  ].join('\n');
  return {
    assunto: `Sua cotação de seguro ${produto} foi respondida — ${MARCA}`,
    html: montar({
      titulo,
      preheader: valor
        ? `Seguro ${produto}: valor estimado de ${valor}.`
        : `Seguro ${produto}: veja a resposta da corretora.`,
      corpo,
    }),
    texto: textoPuro(titulo, [
      saudacao(d.nome),
      '',
      'A corretora respondeu o seu pedido de cotação:',
      '',
      `Seguro: ${produto}`,
      ...(valor ? [`Valor estimado: ${valor}`] : []),
      '',
      'Resposta da corretora:',
      d.resposta.trim(),
      '',
      'Veja os detalhes e fale com a gente pela aba Cotação do app.',
    ]),
  };
}
