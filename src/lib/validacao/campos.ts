/**
 * Validadores de campo reutilizados pelos schemas (conta, indicação...). Funções puras: a
 * mensagem de erro fica nos schemas, que também alimentam o OpenAPI.
 */

/** DDDs em uso, conforme a lista oficial da Anatel. */
const DDDS = new Set([
  ...[11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28],
  ...[31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49],
  ...[51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69],
  ...[71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89],
  ...[91, 92, 93, 94, 95, 96, 97, 98, 99],
]);

/**
 * Telefone brasileiro só com dígitos: DDD oficial + número. Celular (11 dígitos) começa com 9;
 * fixo (10 dígitos) começa com 2 a 5.
 */
export function telefoneValido(digitos: string): boolean {
  if (!/^\d{10,11}$/.test(digitos)) return false;
  if (!DDDS.has(Number(digitos.slice(0, 2)))) return false;
  const primeiro = digitos[2];
  return digitos.length === 11 ? primeiro === '9' : /[2-5]/.test(primeiro);
}

/** NFC, sem espaços nas pontas e com os espaços do meio colapsados em um. */
export function normalizarNome(valor: string): string {
  return valor.normalize('NFC').trim().replace(/\s+/g, ' ');
}

// Letra Unicode; hífen ou apóstrofo só entre letras (D'Ávila, Ana-Maria).
const PALAVRA = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/** Nome já normalizado: 3 a 120 caracteres, só letras, ao menos nome e sobrenome. */
export function nomeCompletoValido(nome: string): boolean {
  if (nome.length < 3 || nome.length > 120) return false;
  const palavras = nome.split(' ');
  return palavras.length >= 2 && palavras.every((p) => PALAVRA.test(p));
}

/** Nome já normalizado com uma palavra ou mais: 2 a 120 caracteres, só letras. */
export function nomeValido(nome: string): boolean {
  if (nome.length < 2 || nome.length > 120) return false;
  return nome.split(' ').every((p) => PALAVRA.test(p));
}
