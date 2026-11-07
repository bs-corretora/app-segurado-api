// Chamadas do painel à API. O navegador envia os cookies de sessão sozinho.
export type CamposComErro = Record<string, string>;

export class ApiError extends Error {
  status: number;
  erro: string;
  campos?: CamposComErro;

  constructor(status: number, erro: string, mensagem: string, campos?: CamposComErro) {
    super(mensagem);
    this.status = status;
    this.erro = erro;
    this.campos = campos;
  }
}

type Opcoes = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; corpo?: unknown };

async function enviar(caminho: string, opcoes: Opcoes): Promise<Response> {
  const temCorpo = opcoes.corpo !== undefined;
  return fetch(`/api/v1${caminho}`, {
    method: opcoes.method ?? 'GET',
    credentials: 'include',
    headers: temCorpo ? { 'Content-Type': 'application/json' } : undefined,
    body: temCorpo ? JSON.stringify(opcoes.corpo) : undefined,
  });
}

export async function chamarApi<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  let resposta = await enviar(caminho, opcoes);

  // Sessão expirada: tenta renovar uma vez e repete a chamada (seção 3.11 da especificação).
  const ehAuth = caminho.startsWith('/auth/');
  if (resposta.status === 401 && !ehAuth) {
    const renovou = await enviar('/auth/refresh', { method: 'POST' });
    if (renovou.ok) resposta = await enviar(caminho, opcoes);
  }

  if (!resposta.ok) {
    let dados: { erro?: string; mensagem?: string; campos?: CamposComErro } = {};
    try {
      dados = await resposta.json();
    } catch {
      // resposta sem corpo JSON
    }
    throw new ApiError(
      resposta.status,
      dados.erro ?? 'ERRO',
      dados.mensagem ?? 'Algo deu errado. Tente de novo.',
      dados.campos,
    );
  }

  if (resposta.status === 204) return undefined as T;
  return (await resposta.json()) as T;
}