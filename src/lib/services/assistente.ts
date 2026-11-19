import { supabaseAdmin } from '@/lib/supabase/server';
import { buscarConhecimento } from '@/lib/services/conhecimento';
import { getEnv } from '@/lib/env';
import {
  dashboard,
  listarApolices,
  buscarApolice,
  listarContatos,
  listarNotificacoes,
} from '@/lib/services/leitura';

export interface MensagemHistorico {
  role: 'user' | 'assistant';
  content: string;
}

export interface FonteConhecimento {
  id: string;
  titulo: string;
}

export interface AtalhoNavegacao {
  rotulo: string;
  tela: string;
  id?: string;
}

export interface AssistenteResponse {
  resposta: string;
  fontes: FonteConhecimento[];
  atalhos: AtalhoNavegacao[];
}

// Groq expõe a API no formato da OpenAI (chat completions com tools).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface FerramentaDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type MensagemModelo =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface RespostaModelo {
  choices: Array<{
    finish_reason: string;
    message: { content: string | null; tool_calls?: ToolCall[] };
  }>;
}

/** Falha do provedor de IA (fora do ar, cota, chave inválida). A rota responde 503. */
export class AssistenteIndisponivelError extends Error {}

/**
 * O modelo tentou chamar uma ferramenta que não existe (o gpt-oss às vezes "chama" uma
 * ferramenta `json` para entregar a resposta final). A Groq recusa com `tool_use_failed`.
 */
class FerramentaInexistenteError extends AssistenteIndisponivelError {}

/** Cota de tokens por minuto do modelo esgotada (429). Cada modelo da Groq tem a própria cota. */
class CotaEsgotadaError extends AssistenteIndisponivelError {}

/** Modelo reserva, usado quando o principal esgota a cota do minuto. */
const MODELO_RESERVA = 'openai/gpt-oss-20b';

// Tools disponíveis para o modelo (apenas leitura, vinculadas ao perfil_id da sessão)
const TOOLS: FerramentaDef[] = [
  {
    name: 'buscar_apolices',
    description:
      'Lista as apólices do segurado autenticado. Retorna: id, produto, numero, status, inicio_vigencia, fim_vigencia.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_apolice_detalhe',
    description:
      'Busca detalhes de uma apólice específica do segurado (inclui prêmio). Requer o ID da apólice.',
    input_schema: {
      type: 'object',
      properties: {
        apolice_id: { type: 'string', description: 'UUID da apólice' },
      },
      required: ['apolice_id'],
    },
  },
  {
    name: 'buscar_sinistros',
    description:
      'Lista os sinistros do segurado autenticado. Retorna: id, protocolo, tipo, status, data_ocorrencia, local.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'buscar_contatos_assistencia',
    description:
      'Lista contatos de assistência 24h e central de sinistros filtrados pelos produtos das apólices ativas do segurado.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['ASSISTENCIA_24H', 'SINISTRO'],
          description: 'Tipo de contato',
        },
      },
      required: ['tipo'],
    },
  },
  {
    name: 'buscar_notificacoes',
    description:
      'Lista notificações do segurado (sistema, marketing). Parâmetro opcional para apenas não lidas.',
    input_schema: {
      type: 'object',
      properties: {
        nao_lidas: { type: 'boolean', description: 'Apenas não lidas' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_dashboard',
    description:
      'Retorna resumo do perfil: nome, iniciais, tempo de casa, aniversário hoje, apólices ativas, notificações não lidas.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

const SYSTEM_PROMPT = `Você é o Assistente Virtual do Segurado da BS Seguros.

REGRAS CRÍTICAS DE SEGURANÇA:
- Você NUNCA acessa o banco de dados diretamente. Só usa as ferramentas (tools) fornecidas.
- As ferramentas já filtram automaticamente pelo perfil_id do usuário autenticado na sessão.
- NUNCA peça, aceite ou use um perfil_id vindo do usuário. O isolamento é garantido pela sessão.
- APENAS LEITURA: você explica dúvidas e orienta com atalhos de navegação. NÃO abre sinistros, NÃO solicita cotações, NÃO altera dados.

COMPORTAMENTO:
- Responda em português do Brasil, de forma clara, acolhedora e direta.
- Use a base de conhecimento (RAG) para responder sobre funcionamento do app, regras, fluxos.
- Use as tools quando o usuário perguntar sobre SEUS dados pessoais (apólices, sinistros, notificações, contatos, dashboard).
- Se a pergunta for sobre o app em geral (como fazer algo, regras, prazos), use o conhecimento RAG.
- Se a pergunta for sobre dados do usuário, use as tools apropriadas.
- Sempre cite as fontes (trechos do conhecimento) quando usar RAG.
- Sempre sugira atalhos de navegação (telas do app) relevantes à resposta.

FORMATO DE RESPOSTA (JSON):
{
  "resposta": "texto da resposta em português",
  "fontes": [{"id": "uuid", "titulo": "Título do trecho"}, {"id": "uuid", "titulo": "Outro título..."}],
  "atalhos": [{"rotulo": "Ver minhas apólices", "tela": "/apolices", "id": "uuid-opcional"}, {"rotulo": "Abrir sinistro", "tela": "/sinistros/novo"}]
}

TELAS DO APP DISPONÍVEIS PARA ATALHOS:
- /inicio (dashboard)
- /apolices (lista de apólices)
- /apolices/:id (detalhe da apólice)
- /sinistros (lista de sinistros)
- /sinistros/novo (abrir novo sinistro)
- /sinistros/:id (detalhe do sinistro)
- /cotacoes (lista de cotações)
- /cotacoes/nova (nova cotação)
- /cotacoes/:id (detalhe da cotação)
- /contatos (assistência 24h e sinistros)
- /notificacoes (todas notificações)
- /perfil (dados cadastrais e senha)
- /indicacoes (programa de indicações)

EXEMPLOS DE ATALHOS:
- Pergunta sobre apólice → atalho para /apolices ou /apolices/:id
- Pergunta sobre sinistro → atalho para /sinistros ou /sinistros/novo
- Pergunta sobre cotação → atalho para /cotacoes ou /cotacoes/nova
- Pergunta sobre notificação → atalho para /notificacoes
- Pergunta sobre contatos → atalho para /contatos
- Pergunta genérica sobre app → atalho relevante conforme contexto`;

async function executarTool(
  nome: string,
  args: Record<string, unknown>,
  perfilId: string
): Promise<string> {
  switch (nome) {
    case 'buscar_apolices': {
      const resultado = await listarApolices(perfilId, { pagina: 1, limite: 20 });
      return JSON.stringify(resultado.itens);
    }
    case 'buscar_apolice_detalhe': {
      const apoliceId = args.apolice_id as string;
      const apolice = await buscarApolice(perfilId, apoliceId);
      return apolice ? JSON.stringify(apolice) : 'Apólice não encontrada';
    }
    case 'buscar_sinistros': {
      const db = supabaseAdmin();
      const { data, error } = await db
        .from('sinistro')
        .select('id, protocolo, tipo, status, data_ocorrencia, local')
        .eq('perfil_id', perfilId)
        .order('criado_em', { ascending: false })
        .limit(20);
      if (error) throw error;
      return JSON.stringify(data ?? []);
    }
    case 'buscar_contatos_assistencia': {
      const tipo = (args.tipo as 'ASSISTENCIA_24H' | 'SINISTRO') ?? 'ASSISTENCIA_24H';
      const contatos = await listarContatos(perfilId, tipo);
      return JSON.stringify(contatos);
    }
    case 'buscar_notificacoes': {
      const naoLidas = (args.nao_lidas as boolean) ?? false;
      const resultado = await listarNotificacoes(perfilId, { pagina: 1, limite: 20 }, { naoLidas });
      return JSON.stringify(resultado.itens);
    }
    case 'buscar_dashboard': {
      const dash = await dashboard(perfilId);
      return JSON.stringify(dash);
    }
    default:
      return `Tool desconhecida: ${nome}`;
  }
}

async function chamarModelo(
  apiKey: string,
  modelo: string,
  mensagens: MensagemModelo[],
  comFerramentas = true
): Promise<RespostaModelo> {
  let res: Response;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 800,
        temperature: 0.2,
        messages: mensagens,
        ...(comFerramentas
          ? {
              tools: TOOLS.map((t) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.input_schema },
              })),
              tool_choice: 'auto',
            }
          : {}),
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new AssistenteIndisponivelError(`falha de rede no provedor: ${(e as Error).message}`);
  }
  if (!res.ok) {
    if (res.status === 400) {
      const corpo = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
      if (corpo?.error?.code === 'tool_use_failed') {
        throw new FerramentaInexistenteError('modelo chamou ferramenta inexistente');
      }
    }
    if (res.status === 429) throw new CotaEsgotadaError(`provedor respondeu 429 (${modelo})`);
    // Só o status vai para o log: o corpo pode repetir a pergunta do usuário.
    throw new AssistenteIndisponivelError(`provedor respondeu ${res.status}`);
  }
  return (await res.json()) as RespostaModelo;
}

/**
 * Chama com ferramentas. Se o modelo inventar uma, repete sem ferramentas para vir texto.
 * Se a cota do minuto acabar, repete no modelo reserva.
 */
async function chamarComRecuo(
  apiKey: string,
  modelo: string,
  mensagens: MensagemModelo[]
): Promise<RespostaModelo> {
  try {
    return await chamarModelo(apiKey, modelo, mensagens);
  } catch (e) {
    if (e instanceof CotaEsgotadaError && modelo !== MODELO_RESERVA) {
      return chamarComRecuo(apiKey, MODELO_RESERVA, mensagens);
    }
    if (!(e instanceof FerramentaInexistenteError)) throw e;
    return chamarModelo(apiKey, modelo, mensagens, false);
  }
}

/** Tira cercas de código (```json ... ```) que alguns modelos colocam em volta do JSON. */
function semCercas(texto: string): string {
  const m = texto.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return m ? m[1] : texto.trim();
}

export async function processarAssistente(
  mensagens: MensagemHistorico[],
  perfilId: string
): Promise<AssistenteResponse> {
  const { GROQ_API_KEY, ASSISTENTE_MODELO } = getEnv();
  if (!GROQ_API_KEY) {
    console.error('[assistente] GROQ_API_KEY não configurada');
    return {
      resposta:
        'Desculpe, o assistente está temporariamente indisponível. Tente novamente mais tarde.',
      fontes: [],
      atalhos: [],
    };
  }

  // Última mensagem do usuário para busca RAG
  const ultimaUsuario = [...mensagens].reverse().find((m) => m.role === 'user');
  const consultaRag = ultimaUsuario?.content ?? '';

  // Busca na base de conhecimento (RAG)
  const trechosConhecimento = await buscarConhecimento(consultaRag, 3);

  const contextoRag =
    trechosConhecimento.length > 0
      ? `\n\nBASE DE CONHECIMENTO (trechos relevantes):\n` +
        trechosConhecimento
          .map((t, i) => `[${i + 1}] ${t.titulo} (id: ${t.id}, categoria: ${t.categoria}):\n${t.conteudo}`)
          .join('\n\n')
      : '\n\nBASE DE CONHECIMENTO: nenhum trecho relevante encontrado.';

  // Conversa enviada ao modelo: system + últimas 10 mensagens
  const conversa: MensagemModelo[] = [
    { role: 'system', content: SYSTEM_PROMPT + contextoRag },
    ...mensagens.slice(-10).map((m) => ({ role: m.role, content: m.content }) as MensagemModelo),
  ];

  let resposta = await chamarComRecuo(GROQ_API_KEY, ASSISTENTE_MODELO, conversa);

  // Loop de tool calling - máximo 5 chamadas de ferramenta por pergunta
  let toolCallsCount = 0;
  const maxToolCalls = 5;
  let iterations = 0;
  const maxIterations = 5;

  while (
    (resposta.choices[0]?.message.tool_calls?.length ?? 0) > 0 &&
    iterations < maxIterations &&
    toolCallsCount < maxToolCalls
  ) {
    iterations++;
    const mensagemModelo = resposta.choices[0].message;
    const chamadas = mensagemModelo.tool_calls ?? [];
    conversa.push({ role: 'assistant', content: mensagemModelo.content, tool_calls: chamadas });

    for (const chamada of chamadas) {
      let conteudo: string;
      if (toolCallsCount >= maxToolCalls) {
        conteudo = 'Limite de consultas atingido nesta pergunta.';
      } else {
        toolCallsCount++;
        try {
          const args = chamada.function.arguments ? JSON.parse(chamada.function.arguments) : {};
          conteudo = await executarTool(chamada.function.name, args as Record<string, unknown>, perfilId);
        } catch (e) {
          console.error('[assistente] erro ao executar tool:', e);
          conteudo = 'Erro ao buscar dados. Tente novamente.';
        }
      }
      // Toda tool_call precisa de resposta, senão o provedor recusa a próxima chamada.
      conversa.push({ role: 'tool', tool_call_id: chamada.id, content: conteudo });
    }

    if (toolCallsCount >= maxToolCalls) break;

    resposta = await chamarComRecuo(GROQ_API_KEY, ASSISTENTE_MODELO, conversa);
  }

  const textoFinal = semCercas(resposta.choices[0]?.message.content ?? '');
  if (!textoFinal) {
    return {
      resposta: 'Não consegui concluir a consulta agora. Tente perguntar de outro jeito.',
      fontes: trechosConhecimento.map((t) => ({ id: t.id, titulo: t.titulo })),
      atalhos: [],
    };
  }

  // Tenta parsear JSON da resposta
  let respostaFinal: AssistenteResponse;
  try {
    const parsed = JSON.parse(textoFinal) as {
      resposta?: string;
      fontes?: Array<{ id?: string; titulo?: string } | string>;
      atalhos?: Array<{ rotulo?: string; label?: string; tela?: string; rota?: string; id?: string }>;
    };
    // Normaliza fontes para formato { id, titulo }
    const fontesNormalizadas: FonteConhecimento[] = Array.isArray(parsed.fontes)
      ? parsed.fontes.map((f) =>
          typeof f === 'string'
            ? { id: '', titulo: f }
            : { id: f.id ?? '', titulo: f.titulo ?? String(f) }
        )
      : [];

    // Normaliza atalhos para formato { rotulo, tela, id? }
    const atalhosNormalizados: AtalhoNavegacao[] = Array.isArray(parsed.atalhos)
      ? parsed.atalhos.map((a) => ({
          rotulo: a.rotulo ?? a.label ?? '',
          tela: a.tela ?? a.rota ?? '',
          id: a.id,
        }))
      : [];

    respostaFinal = {
      resposta: parsed.resposta ?? textoFinal,
      fontes: fontesNormalizadas,
      atalhos: atalhosNormalizados,
    };
  } catch {
    // Fallback: resposta direta sem JSON estruturado
    respostaFinal = {
      resposta: textoFinal,
      fontes: trechosConhecimento.map((t) => ({ id: t.id, titulo: t.titulo })),
      atalhos: [],
    };
  }

  // Garante que fontes incluam títulos dos trechos usados
  if (respostaFinal.fontes.length === 0 && trechosConhecimento.length > 0) {
    respostaFinal.fontes = trechosConhecimento.map((t) => ({ id: t.id, titulo: t.titulo }));
  }

  return respostaFinal;
}