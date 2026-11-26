# Contexto RAG (template e base de conhecimento)

O contexto recuperado é concatenado ao prompt de sistema a cada pergunta. Por isso o texto dos trechos
também é "prompt" e tem versão própria.

## Template de montagem

- **Origem:** `src/lib/services/assistente.ts:344-363`.
- **Consulta:** apenas o texto da última mensagem do usuário (sem reescrita da pergunta).
- **Quantidade:** 3 trechos (`buscarConhecimento(consultaRag, 3)`, `:349`).

Com trechos encontrados, o que vem depois do prompt de sistema é:

```text

BASE DE CONHECIMENTO (trechos relevantes):
[1] <titulo> (id: <uuid>, categoria: <categoria>):
<conteudo>

[2] ...
```

Sem trechos: `BASE DE CONHECIMENTO: nenhum trecho relevante encontrado.` Depois vêm as últimas 10 mensagens
da conversa (`:359-363`).

## Busca

- **Origem:** `src/lib/services/conhecimento.ts` e migration
  `supabase/migrations/20261119000100_conhecimento_rag.sql`.
- **Técnica:** Full-Text Search do PostgreSQL em português (`tsvector` gerado e índice GIN), função
  `buscar_conhecimento(pergunta, limite)` com `websearch_to_tsquery('portuguese', ...)` e `ts_rank`.
- **Sem embeddings e sem serviço de IA na busca:** a recuperação roda no banco e nenhum texto de
  pergunta sai para provedor de IA nessa etapa. A entrega parcial previa `pgvector`; isso não foi
  implementado (ver [../README.md](../README.md#8-evolução-futura-não-implementado)).
- **Limite conhecido:** `websearch_to_tsquery` combina os termos com "E". Pergunta longa, com palavra
  que não aparece em nenhum trecho, pode não recuperar nada; nesse caso o modelo responde sem base
  (ou usa ferramenta). A taxa de acerto da busca não foi medida; só há teste de caso único
  (`buscar_conhecimento('esqueci a senha')` devolve o trecho de senha em primeiro).
- **Falha da busca:** erro no RPC é registrado e a busca devolve lista vazia (`conhecimento.ts:26-29`);
  a pergunta segue sem contexto.

## Conteúdo da base

Oito arquivos em `supabase/conhecimento/` (4.202 caracteres no total; o maior tem 617). Cada um começa
com `# Título` (vira `titulo`) e o restante é o `conteudo`. A categoria vem de um mapa em
`scripts/sync-conhecimento.ts`.

| Arquivo | Categoria |
|---|---|
| `sinistro-abrir.md` | SINISTRO |
| `apolices-consultar.md` | APOLICE |
| `cotacao-solicitar.md` | COTACAO |
| `indicacao-amigo.md`, `notificacoes-gerenciar.md`, `instalacao-pwa.md` | APP_USO |
| `conta-criar-entrar.md`, `conta-senha.md` | CONTA |

Atualização: editar o `.md` e rodar `npm run conhecimento` (script idempotente, usa
`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`). O `supabase/seed.sql` carrega os mesmos oito trechos
no banco local.

## Histórico dos trechos

| Data | Commit | PR | Mudança |
|---|---|---|---|
| 2026-11-18 | `d7edb0b` | #56 | Migration, função de busca, script de sincronização e 5 arquivos iniciais |
| 2026-11-18 | `e5fe4e7` | #56 | Tópicos Conta e Instalação do PWA |
| 2026-11-19 | `65701f1` | #56 | Seed sem coluna inexistente; caminho do script corrigido |
| 2026-11-19 | `b6e725e` | #56 | Textos conferidos com as telas: removidos biometria, login por CPF, anexo de fotos, deslizar notificação e recuperar senha por CPF, que o app não tem; nomes reais de botões e abas |

Histórico completo: `git log --follow -- supabase/conhecimento/<arquivo>.md`.
