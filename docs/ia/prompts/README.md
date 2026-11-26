# Repositório de prompts do Assistente Virtual

Os prompts do app vivem no código e são versionados pelo Git. Esta pasta é o catálogo: cada prompt
em um arquivo, com a origem (arquivo e linha) e o histórico. Rastreabilidade é o histórico do
repositório; os rótulos v1 a v5 abaixo são nomes desta tabela, não tags do Git.

| Arquivo | Prompt | Origem no código |
|---|---|---|
| [01-prompt-de-sistema.md](01-prompt-de-sistema.md) | Prompt de sistema (regras, nomes reais das telas, formato JSON) | `src/lib/services/assistente.ts:150-213` |
| [02-descricoes-das-ferramentas.md](02-descricoes-das-ferramentas.md) | Descrições das 6 ferramentas de leitura | `src/lib/services/assistente.ts:77-148` |
| [03-contexto-rag.md](03-contexto-rag.md) | Template do contexto recuperado e base de conhecimento | `assistente.ts:344-363`, `supabase/conhecimento/*.md` |

Não há agente de validação de saída por IA: a validação do que o modelo devolve é código
(`semCercas`, `JSON.parse` com normalização e fallback, `assistente.ts:323-327` e `:415-458`).
Ver [../limites-e-qualidade.md](../limites-e-qualidade.md).

## Versões do prompt de sistema e dos parâmetros

Links no formato `https://github.com/bs-corretora/app-segurado-api/commit/<sha>`.

| Versão | Data | Commit | PR / issue | O que mudou | Por quê |
|---|---|---|---|---|---|
| v1 | 2026-11-18 | [`5485cac`](https://github.com/bs-corretora/app-segurado-api/commit/5485cac25c0b0acf49e1a7d3734609b33d8376b9) | #56 (issues #53, #54, #55) | Prompt inicial, para Claude Haiku (`claude-3-5-haiku-20241022`), `max_tokens` 2000, RAG com 5 trechos. Fontes como lista de textos; atalhos `{label, rota}`; seção "ROTAS DO APP" | Primeira versão do assistente |
| v2 | 2026-11-18 | [`e2f20a5`](https://github.com/bs-corretora/app-segurado-api/commit/e2f20a564fa4a5495f6166381c1870e5bd3699c9) | #56 (issue #55) | Formato de saída passa a `fontes: {id, titulo}` e `atalhos: {rotulo, tela, id?}`; "rotas" vira "telas"; `max_tokens` 2000 para 1500; modelo vindo de `ASSISTENTE_MODELO` | Alinhar ao contrato de saída definido na issue #55 |
| v2.1 | 2026-11-19 | [`65701f1`](https://github.com/bs-corretora/app-segurado-api/commit/65701f15d624ad11a8a37c76f8d1e505f7965ba1) | #56 | Modelo padrão trocado para `claude-haiku-5-5`; texto do prompt igual | O `claude-3-5-haiku` foi aposentado (mensagem do commit) |
| v3 | 2026-11-19 | [`31dfdd2`](https://github.com/bs-corretora/app-segurado-api/commit/31dfdd2caa558471c3cd48f343a4901f34d5a9d4) | #58 (issue #57) | Provedor passa a ser a Groq (`fetch`, formato OpenAI); `temperature: 0.2` explícita; padrão `llama-3.3-70b-versatile`; o trecho do RAG passa a levar o `id` (o prompt já pedia `fontes[].id` desde a v2); texto do prompt igual ao da v2 | O grupo não tinha chave paga da Anthropic; a Groq tem plano gratuito |
| v3.1 | 2026-11-19 | [`c171f8f`](https://github.com/bs-corretora/app-segurado-api/commit/c171f8fad69d561a33c31b3e3ddc515497f2e598) | #59 (issue #57) | Modelo padrão `openai/gpt-oss-120b` | O `llama-3.3-70b-versatile` não estava mais disponível na Groq (corpo do PR #59) |
| v3.2 | 2026-11-19 | [`246099a`](https://github.com/bs-corretora/app-segurado-api/commit/246099a2bff5064c51c8713ea19047e89a7d71fe) | #59 (issue #57) | `max_tokens` 1500 para 800; RAG de 5 para 3 trechos; repetição sem ferramentas em `tool_use_failed`; modelo reserva `openai/gpt-oss-20b` no 429; texto do prompt igual | Falha de `tool_use_failed` e cota de 8 mil tokens por minuto (ver [../prompts-que-falharam.md](../prompts-que-falharam.md)) |
| v4 | 2026-11-19 | [`8377a19`](https://github.com/bs-corretora/app-segurado-api/commit/8377a19ff1b1a255982e202d732cb849ba598338) | #60 (issue #57) | Prompt de sistema ganha 16 linhas: citar número da apólice, texto sem Markdown, nunca inventar função (sem anexo de fotos, sem biometria, login por e-mail e senha) e o bloco "NOMES REAIS NO APP" | O teste ponta a ponta em produção mostrou nomes de telas inventados, Markdown e função inexistente |
| v5 | 2026-11-25 | [`feee25f`](https://github.com/bs-corretora/app-segurado-api/commit/feee25f9d59fbcd441c53014db05b60a377266de) | #69 | Prompt de sistema ganha 2 linhas em "REGRAS CRÍTICAS DE SEGURANÇA": nunca afirmar nem prometer que um sinistro será pago, aprovado ou coberto, nem estimar indenização (orientar a acompanhar na aba "Sinistro" e falar com a equipe de sinistros); nunca confirmar cobertura (orientar a consultar a apólice e a corretora) | Regra prevista na especificação (P-01) que faltava no prompt; teste unitário passa a checar o prompt enviado à Groq |

A tabela lista os commits que alteraram o texto do prompt ou os parâmetros enviados ao modelo. A
conferência de que o texto da v1 para a v2 mudou só nas linhas descritas, e de que v2, v3 e v3.2 têm
prompt idêntico, foi feita comparando o conteúdo da constante `SYSTEM_PROMPT` em cada commit.

## Como reproduzir o histórico

```bash
# Todas as alterações do arquivo que contém os prompts, com o diff
git log --follow -p -- src/lib/services/assistente.ts

# Só o trecho do prompt de sistema na versão atual (linhas 150-213)
git log -L150,213:src/lib/services/assistente.ts

# Base de conhecimento
git log --follow -p -- supabase/conhecimento/
```

## Observações sobre a rastreabilidade

- O prompt está dentro de `assistente.ts`, não em arquivo próprio. Isso mantém um único ponto de
  verdade, mas mistura prompt e código no `git blame`. Extrair para um arquivo versionado é uma
  melhoria possível; não foi feita nesta entrega, que não altera código.
- Não há prompt guardado no banco nem em serviço externo. Nada fora do Git precisa ser exportado.
