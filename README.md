# App do Segurado — API e banco

Back-end do App do Segurado (BS Seguros): API REST, painel administrativo web e banco de dados.

> Projeto em construção. Esta página descreve a estrutura combinada; os comandos de execução
> passam a valer à medida que o código for entrando.

## Documentação

- [Especificação técnica](docs/especificacao-tecnica.md): requisitos, modelo de dados, API e segurança.
- [Plano de implementação do back-end](docs/PLANO-BACKEND.md): ordem de construção e contrato com o app.

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript, Node.js 22 |
| API e painel administrativo | Next.js (Route Handlers em `app/api/v1/**`) |
| Banco de dados | PostgreSQL gerenciado pelo Supabase |
| Autenticação | Supabase Auth (e-mail e senha), tokens em cookie HttpOnly emitido pela API |
| Arquivos | Supabase Storage, bucket privado `apolices` |
| Validação | Zod |
| Documentação da API | OpenAPI 3 gerado dos schemas Zod, Swagger UI |
| Tarefas agendadas | pg_cron |
| IA | Google Gemini API, isolada em `lib/ai/client.ts` |
| Migrations e seed | Supabase CLI (`supabase/migrations/*.sql`, `supabase/seed.sql`) |
| Contêiner e deploy | Docker; Render |

## Arquitetura

```text
App mobile ─┐
            ├── HTTPS/JSON ──> API Next.js ── service_role ──> Supabase
Admin web ──┘                  (contêiner)                     (PostgreSQL, Auth, Storage)
```

- Os clientes acessam somente a API. Nenhuma chave do Supabase vai para o app.
- A API acessa o Supabase com a chave `service_role`, que fica apenas no servidor.
- Todas as tabelas têm RLS habilitado, sem policies para `anon` e `authenticated`.

## Estrutura

| Diretório | Responsabilidade |
|---|---|
| `app/api/v1/**/route.ts` | Rotas da API: validação com Zod e chamada ao serviço |
| `app/admin/**` | Painel administrativo web |
| `lib/services` | Regras de negócio |
| `lib/supabase` | Cliente Supabase do lado do servidor |
| `lib/security` | Sessão por cookie, CORS e rate limit |
| `lib/ai` | Cliente do LLM e prompts versionados (`lib/ai/prompts/`) |
| `supabase/migrations` | Migrations SQL |
| `supabase/seed.sql` | Dados fictícios de desenvolvimento |

## Como rodar (desenvolvimento)

Pré-requisitos: Node.js 22, Docker e Supabase CLI.

```bash
cp .env.example .env
supabase start
docker compose up --build
```

## Variáveis de ambiente

Ver `.env.example`. O repositório nunca recebe o arquivo `.env` com valores.

## Fluxo de trabalho

- Cada pessoa trabalha em uma branch própria e abre Pull Request para a `main`.
- Migration que já foi para a `main` não se edita; correção vira uma migration nova.
