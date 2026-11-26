# Integrações de IA e engenharia de prompt

Documento do item 1.2 da entrega final. Descreve o que existe no código da `main` hoje. O que foi
planejado e não implementado está na última seção, marcado como evolução futura.

Índice da pasta:

| Arquivo | Conteúdo |
|---|---|
| este arquivo | Provedores, fluxo, fallback, variáveis, privacidade |
| [prompts/](prompts/README.md) | Repositório de prompts, com origem no código e histórico de versões |
| [prompts-que-falharam.md](prompts-que-falharam.md) | Falhas reais de prompt e como foram corrigidas |
| [custo.md](custo.md) | Custo por pergunta, por usuário e em escala |
| [limites-e-qualidade.md](limites-e-qualidade.md) | Falha do provedor, controle de qualidade, o que a IA não faz |

## 1. Onde a IA é usada

Há **uma** integração de IA em produção: o **Assistente Virtual do Segurado**, na rota
`POST /api/v1/assistente` (app do segurado: card "Tire suas dúvidas" no Início e Configurações > Ajuda). Ele responde dúvidas sobre o app
e consulta, em modo somente leitura, os dados do próprio segurado (apólices, sinistros, contatos de
assistência, notificações, resumo do perfil), sempre devolvendo texto e atalhos de navegação.

A IA não decide nada que altere dados: não abre sinistro, não pede cotação, não muda cadastro
(regra no prompt e, principalmente, nas ferramentas, que só têm consultas).

## 2. Provedores e modelos

| Função | Provedor | Modelo | Como é chamado |
|---|---|---|---|
| Modelo principal | Groq (API compatível com OpenAI, `chat/completions` com `tools`) | `openai/gpt-oss-120b` (padrão; muda por `ASSISTENTE_MODELO`) | `fetch` direto, sem SDK |
| Modelo reserva | Groq | `openai/gpt-oss-20b` (fixo no código) | Mesmo cliente, usado quando o principal responde 429 |
| Recuperação de contexto (RAG) | PostgreSQL (Supabase), Full-Text Search em português | não é modelo de IA | RPC `buscar_conhecimento` |

Histórico do provedor: a primeira versão usava a API da Anthropic (Claude Haiku, `ANTHROPIC_API_KEY`).
O grupo não tinha chave paga, e a rota respondia 503 em produção; a issue #57 trocou para a Groq
(PRs #58, #59, #60). `ANTHROPIC_API_KEY` e o SDK foram removidos. Detalhes em
[prompts/README.md](prompts/README.md#versões-do-prompt-de-sistema-e-dos-parâmetros).

Parâmetros da chamada (`src/lib/services/assistente.ts:269-285`): `temperature` 0,2, `max_tokens` 800,
`tool_choice: auto`, tempo limite de 30 s por chamada.

## 3. Onde cada parte está no código

| Responsabilidade | Local |
|---|---|
| Rota: sessão, rate limit, validação, tradução de erro em HTTP | `src/app/api/v1/assistente/route.ts` |
| Orquestração (RAG, laço de ferramentas, pós-processamento) | `src/lib/services/assistente.ts:329-461` (`processarAssistente`) |
| Chamada HTTP à Groq | `assistente.ts:258-301` (`chamarModelo`) |
| Recuos (fallback) | `assistente.ts:303-321` (`chamarComRecuo`) |
| Ferramentas (descrições e execução) | `assistente.ts:77-148` e `:213-256` |
| Prompt de sistema | `assistente.ts:150-211` |
| Busca de conhecimento | `src/lib/services/conhecimento.ts` e migration `20261119000100_conhecimento_rag.sql` |
| Sincronização da base | `scripts/sync-conhecimento.ts` (`npm run conhecimento`) |
| Variáveis | `src/lib/env.ts:31-35`, `.env.example` |
| Limite de uso | `src/lib/security/rate-limit.ts:13` |

## 4. Fluxo de uma pergunta

```
App do segurado
  | POST /api/v1/assistente  { mensagens: [{papel, texto}] }  (até 10, texto até 4.000 caracteres)
  v
route.ts
  1. exige sessão de SEGURADO (Bearer)            -> 401/403
  2. rate limit 20 perguntas / 10 min por perfil  -> 429 com Retry-After
  3. GROQ_API_KEY configurada?                    -> senão 503
  4. valida o corpo (zod); última mensagem é do usuário  -> 400
  v
processarAssistente(mensagens, perfil_id da sessão)
  5. RAG: última pergunta -> buscar_conhecimento (FTS) -> até 3 trechos
  6. monta: [system = prompt de sistema + trechos] + últimas 10 mensagens
  7. chamarComRecuo -> Groq (modelo principal, com ferramentas)
  8. laço de ferramentas (máx. 5 execuções): modelo pede ferramenta -> executarTool(perfil_id da
     sessão) -> resultado volta como mensagem "tool" -> nova chamada
  9. pós-processamento: remove cercas ```json, JSON.parse, normaliza fontes e atalhos, usa os
     trechos do RAG como fontes se o modelo não citou nenhuma
  v
200 { resposta, fontes[{id,titulo}], atalhos[{rotulo,tela,id?}] }
```

Contexto de uso: uma pergunta do segurado gera de 1 a 6 chamadas ao modelo (uma sem ferramenta; uma
mais uma por rodada de ferramenta), fora as repetições dos recuos. O histórico da conversa fica só na memória da tela do app;
o servidor não guarda conversa.

## 5. Fallbacks reais

<a id="fallbacks-reais"></a>

| Situação | O que o código faz | Local |
|---|---|---|
| Groq responde 429 (cota de tokens por minuto) no modelo principal | Repete a mesma conversa no `openai/gpt-oss-20b`, que tem cota própria | `assistente.ts:307-317` |
| 429 também no reserva | Desiste: `AssistenteIndisponivelError`, rota responde 503 | `:296`, `route.ts:77-80` |
| Groq responde 400 `tool_use_failed` (modelo "chamou" ferramenta inexistente, como `json`) | Repete a chamada **sem** ferramentas, para vir texto | `:290-294`, `:318-319` |
| Falha de rede, tempo limite de 30 s, outro status HTTP (401 de chave inválida, 5xx) | `AssistenteIndisponivelError`; rota responde 503 `INDISPONIVEL`. Só o status vai ao log | `:286-299` |
| Ferramenta lança erro (banco, argumento inválido) | O modelo recebe "Erro ao buscar dados. Tente novamente." e continua | `:392-395` |
| Passou de 5 execuções de ferramenta | Chamadas excedentes recebem "Limite de consultas atingido" e o laço encerra | `:385-401` |
| Modelo devolve texto vazio | Resposta fixa "Não consegui concluir a consulta agora..." | `:406-413` |
| Modelo devolve texto que não é JSON | Usa o texto como resposta e os trechos do RAG como fontes, sem atalhos | `:446-453` |
| Busca de conhecimento falha | Registra o erro e segue sem contexto | `conhecimento.ts:26-29` |
| `GROQ_API_KEY` ausente | Rota responde 503 antes de validar o corpo | `route.ts:35-40` |

**Não existe circuit breaker.** Cada pergunta tenta o provedor de novo, mesmo que a anterior tenha
falhado. A degradação é por pergunta (recuos acima), sem estado compartilhado que "abra" o circuito.
O rate limit (`rate-limiter-flexible`, `RateLimiterMemory`) é em memória do processo: reinicia no
deploy e, com mais de uma instância, cada uma conta separado. Evolução possível está na seção 8.

O app mobile mostra mensagens próprias para 429 e 503, botão de tentar de novo e o aviso fixo
"Respostas geradas por IA podem conter erros" (PR #27 do repositório do app).

## 6. Variáveis de ambiente

Só nomes; nunca valores. Modelo em `.env.example`.

| Variável | Obrigatória | Para quê | Onde configurar |
|---|---|---|---|
| `GROQ_API_KEY` | para o assistente funcionar | Chave da Groq (`https://console.groq.com/keys`). Sem ela a rota responde 503 e o resto da API segue normal | `.env` local; no Render, variável de ambiente do serviço (ver README, seção "Assistente de IA") |
| `ASSISTENTE_MODELO` | não | Modelo principal da Groq com suporte a ferramentas. Padrão `openai/gpt-oss-120b` | idem |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | sim | Usadas também pela busca de conhecimento e pelas ferramentas | idem |

O modelo reserva não tem variável: `openai/gpt-oss-20b` está fixo em `assistente.ts:74`.
`render.yaml` **não** lista `GROQ_API_KEY` nem `ASSISTENTE_MODELO`; no Render elas são criadas à mão em
Environment (conferir se já estão no serviço publicado).

## 7. Limites e privacidade

**O que vai para a Groq em cada chamada**

- Prompt de sistema (texto fixo, sem dado pessoal) e até 3 trechos da base de conhecimento (texto
  público do app).
- As últimas 10 mensagens da conversa, como o segurado digitou (até 4.000 caracteres cada).
- O resultado das ferramentas que o modelo pediu, do próprio segurado: nome e iniciais, tempo de casa,
  se faz aniversário hoje, quantidade de notificações não lidas, produto, número, status, vigência e
  prêmio das apólices, protocolo, tipo, status, data e local dos sinistros, telefones de assistência,
  título e texto das notificações. As listas têm no máximo 20 itens.

**O que não vai:** CPF, e-mail, senha, tokens, data de nascimento (só o indicador "aniversário
hoje"), dados de outros segurados. O `perfil_id` nunca é parâmetro de ferramenta: é fixado pela
sessão no servidor (teste "SEGURANÇA: deve usar APENAS o perfil_id da sessão").

**O que fica no nosso lado:** o servidor não persiste conversa. O log da rota registra só status,
`perfil_id` e duração; o log do provedor registra só o status HTTP, porque o corpo do erro pode repetir
a pergunta (`assistente.ts:297`, `route.ts:73` e `:78`).

**Pendente de conferência (não verificado):** política de retenção e de treinamento da Groq sobre
os dados enviados, e base legal e aviso de privacidade ao segurado para esse envio a terceiro (LGPD).
Decisão e texto cabem ao grupo e à BS Seguros.

**Limites de uso:** 20 perguntas por 10 minutos por segurado; histórico máximo de 10 mensagens;
resposta máxima de 800 tokens; 5 execuções de ferramenta por pergunta; 30 s por chamada ao modelo.
Cota do plano gratuito da Groq: 8 mil tokens por minuto por modelo, medida no PR #59; ver
[custo.md](custo.md).

## 8. Evolução futura (não implementado)

A entrega parcial (`entrega-parcial.md`, seção 5) planejou três prompts. Situação no código:

| Planejado | Situação |
|---|---|
| P-01 Assistente do segurado, com RAG em `pgvector` e rota `POST /ia/assistente/mensagens` | Implementado em forma diferente: RAG por Full-Text Search, sem `pgvector`; rota `POST /api/v1/assistente`; sem prompts em `lib/ai/prompts/` nem conjunto de 30 perguntas de avaliação |
| P-02 Triagem e resumo de sinistro (JSON com tipo sugerido, dados faltantes e emergência) | **Não implementado.** Não há coluna `tipo_sugerido_ia`/`resumo_ia` nem chamada ao modelo na abertura de sinistro |
| P-03 Rascunho de campanha | **Não implementado.** A tela de campanhas do painel envia texto escrito pelo operador |

Outras melhorias identificadas e não feitas: circuit breaker com estado compartilhado, rate limit
em armazenamento compartilhado, registro de `usage` (tokens) por chamada, conjunto de avaliação
automatizado dos prompts, extração do prompt para arquivo próprio, busca vetorial.
