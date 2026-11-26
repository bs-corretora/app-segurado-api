/**
 * Formatação e máscara de dados pessoais para EXIBIÇÃO. O banco e a API continuam com só dígitos;
 * estas funções rodam no painel (navegador) e nos logs (servidor), por isso não dependem de nada.
 */

/** Só os dígitos de um texto. */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/** CPF completo formatado: 99887766593 → 998.877.665-93. Se não tiver 11 dígitos, devolve como veio. */
export function formatarCpf(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const d = soDigitos(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** CPF com os três primeiros e os dois últimos dígitos ocultos: 99887766593 → ***.877.665-**. */
export function mascararCpf(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const d = soDigitos(cpf);
  if (d.length !== 11) return '***.***.***-**';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Telefone brasileiro: 81998765432 → (81) 99876-5432; 8133334444 → (81) 3333-4444. Outros tamanhos ficam como vieram. */
export function formatarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return '—';
  const d = soDigitos(telefone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}

const PADROES_SENSIVEIS: [RegExp, string][] = [
  [/(?<![\w.-])\d{3}\.\d{3}\.\d{3}-\d{2}(?![\w-])/g, '[cpf]'],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[email]'],
  [/(?<![\w.-])\(?\d{2}\)?\s?9?\d{4}-\d{4}(?![\w-])/g, '[telefone]'],
  [/(?<![\w.-])\d{10,13}(?![\w-])/g, '[numero]'],
];

/**
 * Troca CPF, e-mail, telefone e sequências longas de dígitos de um texto por marcadores. Serve
 * para mensagens de erro e de log, que podem trazer o valor que causou a falha (ex.: o
 * `details` do Postgres numa violação de unicidade traz "Key (cpf)=(99887766593)").
 */
export function redigir(texto: string): string {
  return PADROES_SENSIVEIS.reduce((t, [padrao, marcador]) => t.replace(padrao, marcador), texto);
}

/** Descreve um erro qualquer para o log sem os valores pessoais que ele possa carregar. */
export function descreverErro(e: unknown): string {
  if (e instanceof Error) return redigir(e.stack ?? `${e.name}: ${e.message}`);
  if (e && typeof e === 'object') {
    const { code, message, details, hint } = e as Record<string, unknown>;
    return redigir(
      [code, message, details, hint].filter((p) => typeof p === 'string' && p).join(' | '),
    );
  }
  return redigir(String(e));
}

/** Caminho da requisição sem o que é credencial: o token do aparelho em /dispositivos/{token}. */
export function caminhoSeguro(caminho: string): string {
  return redigir(caminho.replace(/(\/dispositivos\/)[^/]+/, '$1:token'));
}
