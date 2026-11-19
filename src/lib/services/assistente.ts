import { Anthropic } from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase/server';
import { buscarConhecimento } from '@/lib/services/conhecimento';
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

export interface AssistenteResponse {
  resposta: string;
  fontes: string[];
  atalhos: Array<{ label: string; rota: string }>;
}

interface ToolResult {
  toolUseId: string;
  content: string;
}

// Tools disponíveis para o modelo (apenas leitura, vinculadas ao perfil_id da sessão)
const TOOLS: Anthropic.Tool[] = [
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
- Sempre sugira atalhos de navegação (rotas do app) relevantes à resposta.

FORMATO DE RESPOSTA (JSON):
{
  "resposta": "texto da resposta em português",
  "fontes": ["trecho 1 do conhecimento usado", "trecho 2..."],
  "atalhos": [{"label": "Ver minhas apólices", "rota": "/apolices"}, {"label": "Abrir sinistro", "rota": "/sinistros/novo"}]
}

ROTAS DO APP DISPONÍVEIS PARA ATALHOS:
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

export async function processarAssistente(
  mensagens: MensagemHistorico[],
  perfilId: string
): Promise<AssistenteResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[assistente] ANTHROPIC_API_KEY não configurada');
    return {
      resposta:
        'Desculpe, o assistente está temporariamente indisponível. Tente novamente mais tarde.',
      fontes: [],
      atalhos: [],
    };
  }

  const anthropic = new Anthropic({ apiKey });

  // Última mensagem do usuário para busca RAG
  const ultimaUsuario = [...mensagens].reverse().find((m) => m.role === 'user');
  const consultaRag = ultimaUsuario?.content ?? '';

  // Busca na base de conhecimento (RAG)
  const trechosConhecimento = await buscarConhecimento(consultaRag, 5);

  // Contexto do RAG para o system prompt
  const contextoRag =
    trechosConhecimento.length > 0
      ? `\n\nBASE DE CONHECIMENTO (trechos relevantes):\n` +
        trechosConhecimento
          .map(
            (t, i) =>
              `[${i + 1}] ${t.titulo} (categoria: ${t.categoria}):\n${t.conteudo}`
          )
          .join('\n\n')
      : '\n\nBASE DE CONHECIMENTO: nenhum trecho relevante encontrado.';

  const systemPromptCompleto = SYSTEM_PROMPT + contextoRag;

  // Prepara mensagens para o Claude (últimas 10)
  const mensagensClaude: Anthropic.MessageParam[] = mensagens.slice(-10).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Primeira chamada ao modelo
  let response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 2000,
    system: systemPromptCompleto,
    messages: mensagensClaude,
    tools: TOOLS,
    tool_choice: { type: 'auto' },
  });

  // Loop de tool calling
  const toolResults: ToolResult[] = [];
  let iterations = 0;
  const maxIterations = 3;

  while (
    response.stop_reason === 'tool_use' &&
    iterations < maxIterations
  ) {
    iterations++;
    const toolUses = response.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === 'tool_use'
    );

    for (const toolUse of toolUses) {
      try {
        const result = await executarTool(
          toolUse.name,
          toolUse.input as Record<string, unknown>,
          perfilId
        );
        toolResults.push({ toolUseId: toolUse.id, content: result });
      } catch (e) {
        console.error('[assistente] erro ao executar tool:', e);
        toolResults.push({
          toolUseId: toolUse.id,
          content: 'Erro ao buscar dados. Tente novamente.',
        });
      }
    }

    // Próxima chamada com resultados das tools
    response = await anthropic.messages.create({
      model: 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
      system: systemPromptCompleto,
      messages: [
        ...mensagensClaude,
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: toolResults.map((r) => ({
            type: 'tool_result' as const,
            tool_use_id: r.toolUseId,
            content: r.content,
          })),
        },
      ],
      tools: TOOLS,
      tool_choice: { type: 'auto' },
    });
  }

  // Extrai resposta final
  const textoFinal = response.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('');

  // Tenta parsear JSON da resposta
  let respostaFinal: AssistenteResponse;
  try {
    const parsed = JSON.parse(textoFinal);
    respostaFinal = {
      resposta: parsed.resposta ?? textoFinal,
      fontes: Array.isArray(parsed.fontes) ? parsed.fontes : [],
      atalhos: Array.isArray(parsed.atalhos) ? parsed.atalhos : [],
    };
  } catch {
    // Fallback: resposta direta sem JSON estruturado
    respostaFinal = {
      resposta: textoFinal,
      fontes: trechosConhecimento.map((t) => t.titulo),
      atalhos: [],
    };
  }

  // Garante que fontes incluam títulos dos trechos usados
  if (respostaFinal.fontes.length === 0 && trechosConhecimento.length > 0) {
    respostaFinal.fontes = trechosConhecimento.map((t) => t.titulo);
  }

  return respostaFinal;
}