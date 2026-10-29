const FUSO = 'America/Sao_Paulo';

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo — o servidor pode estar em UTC. */
export function hojeSaoPaulo(agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(agora);
}

function partes(data: string) {
  const [ano, mes, dia] = data.slice(0, 10).split('-').map(Number);
  return { ano, mes, dia };
}

const bissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;

/** Anos e meses completos entre `desde` e `hoje` (RF-07, "3 anos e 4 meses"). */
export function tempoDeCasa(desde: string, hoje = hojeSaoPaulo()) {
  const a = partes(desde);
  const b = partes(hoje);
  let meses = (b.ano - a.ano) * 12 + (b.mes - a.mes);
  if (b.dia < a.dia) meses--;
  meses = Math.max(0, meses);
  return { anos: Math.floor(meses / 12), meses: meses % 12 };
}

/** RF-08: aniversário hoje. Nascidos em 29/02 comemoram em 28/02 nos anos não bissextos (5.4). */
export function aniversarioHoje(nascimento: string, hoje = hojeSaoPaulo()) {
  const n = partes(nascimento);
  const h = partes(hoje);
  if (n.mes === 2 && n.dia === 29 && !bissexto(h.ano)) return h.mes === 2 && h.dia === 28;
  return n.mes === h.mes && n.dia === h.dia;
}

/** "Maria Souza" → "MS"; "Fernanda" → "F". */
export function iniciais(nome: string) {
  const palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return '';
  const primeira = palavras[0][0];
  const ultima = palavras.length > 1 ? palavras[palavras.length - 1][0] : '';
  return (primeira + ultima).toUpperCase();
}
