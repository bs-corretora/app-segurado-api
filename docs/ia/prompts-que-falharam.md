# Prompts que falharam e como foram ajustados

Assistente Virtual do Segurado (`POST /api/v1/assistente`). Casos tirados do histórico do repositório
(issue #57, PRs #59 e #60) e dos testes ponta a ponta de 19/11/2026 (Groq com o banco de produção,
perfil de teste da Maria). Versões do prompt em [prompts/README.md](prompts/README.md).

## Caso 1. Nomes de tela, função e formatação inventados (PR #60, commit `8377a19`)

- **Pedido ao modelo:** orientar o segurado a abrir sinistro e a encontrar a assistência, com o prompt v3
  (regras e formato JSON, sem lista de nomes das telas).
- **Saída errada:** mandava ir na aba "Sinistros" (o nome é "Sinistro"), no botão "Abrir novo sinistro"
  (é "Abrir sinistro"), a anexar fotos (o app não tem anexo) e a uma tela "Contatos" (é a aba
  "Assistência"). Não citava o número da apólice. A resposta chegava com Markdown (`**texto**`), que o
  app exibiu com os asteriscos.
- **Ajuste (v4):** bloco "NOMES REAIS NO APP" copiado dos rótulos do app, regra "nunca invente função que o
  app não tem" (sem anexo, sem biometria, login por e-mail e senha), pedido de texto sem Markdown e do
  número da apólice. Os trechos da base de conhecimento tinham o mesmo defeito (biometria, login por
  CPF, anexo de fotos) e foram corrigidos em `b6e725e`. O app ganhou também um tratamento do
  Markdown residual (PR #28 do app, `95107cc`).
- **Validação:** nova rodada em produção com 3 perguntas; as respostas usaram os nomes certos e o número
  das apólices. Não há teste automatizado do texto do prompt (as chamadas à Groq são simuladas), então a
  conferência foi manual.

## Caso 2. Modelo "chama" uma ferramenta que não existe (PR #59, commit `246099a`)

- **Pedido ao modelo:** responder usando as seis ferramentas de leitura declaradas.
- **Saída errada:** o `gpt-oss` às vezes tentava chamar uma ferramenta `json` para entregar a resposta
  final; a Groq recusava com 400 `tool_use_failed` e o segurado recebia erro 503.
- **Ajuste:** não foi mudança de texto. No 400 `tool_use_failed` a chamada é repetida sem ferramentas,
  para vir texto (`assistente.ts:290-294`, `:318-319`).
- **Validação:** teste unitário "repete sem ferramentas quando o modelo chama ferramenta inexistente"
  (`tests/unit/assistente.test.ts:621`); em produção, 5 de 5 perguntas responderam com os dados da
  conta de teste e o atalho certo, em 1 a 4 s cada.

## Caso 3. Contexto grande demais para a cota do plano gratuito (PR #59, commit `246099a`)

- **Sintoma:** respostas 429 da Groq, pois a cota gratuita é de 8 mil tokens por minuto por modelo.
- **Ajuste:** `max_tokens` de 1500 para 800, contexto RAG de 5 para 3 trechos e repetição no
  `openai/gpt-oss-20b` (cota própria) no 429.
- **Validação:** testes "usa o modelo reserva quando a cota do principal acaba (429)" e "desiste com 503
  quando o reserva também esgota a cota" (`:637`, `:649`).

## O que ainda não é coberto

Sem conjunto de perguntas de avaliação nem checagem automática de alucinação: a regressão do texto do
prompt depende de reteste manual. Ver [limites-e-qualidade.md](limites-e-qualidade.md).
