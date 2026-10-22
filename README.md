# App do Segurado — API e banco

Back-end do App do Segurado (BS Seguros): API REST, painel administrativo web e banco de dados.

> Projeto em construção. O plano por etapas está em [`docs/PLANO-BACKEND.md`](docs/PLANO-BACKEND.md)
> e as regras completas em [`docs/especificacao-tecnica.md`](docs/especificacao-tecnica.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | TypeScript, Node.js 22 |
| API e painel administrativo | Next.js (Route Handlers em `src/app/api/v1/**`) |
| Banco de dados | PostgreSQL gerenciado pelo Supabase |
| Autenticação | Supabase Auth (e-mail e senha), tokens em cookie HttpOnly emitido pela API |
| Arquivos | Supabase Storage, bucket privado `apolices` |
| Validação | Zod |
| Documentação da API | OpenAPI 3 gerado dos schemas Zod, Swagger UI |
| Tarefas agendadas | pg_cron |
| IA | Google Gemini API, isolada em `src/lib/ai/client.ts` |
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
| `src/app/api/v1/**/route.ts` | Rotas da API: validação com Zod e chamada ao serviço |
| `src/app/admin/**` | Painel administrativo web |
| `src/lib/services` | Regras de negócio |
| `src/lib/supabase` | Cliente Supabase do lado do servidor |
| `src/lib/security` | Sessão por cookie, CORS e rate limit |
| `src/lib/ai` | Cliente do LLM e prompts versionados (`src/lib/ai/prompts/`) |
| `supabase/migrations` | Migrations SQL |
| `supabase/seed.sql` | Dados fictícios de desenvolvimento |

## Como rodar (desenvolvimento)

### Pré-requisitos

- **Node.js 22** (`node -v`).
- **Docker Desktop** rodando. No Windows ele usa o WSL2, que precisa do recurso
  "Plataforma de Máquina Virtual" ligado (ver [Problemas comuns](#problemas-comuns)).
- **Supabase CLI 2.121 ou mais nova** (`supabase --version`). Sem instalar, dá para usar
  `npx supabase@latest` no lugar de `supabase` em todos os comandos abaixo.

### Passo a passo

```bash
npm install

# 1. Sobe o Supabase local (PostgreSQL, Auth, Storage) no Docker.
#    Na primeira vez baixa as imagens (alguns GB) e demora alguns minutos.
supabase start

# 2. Cria o .env a partir do exemplo e preenche com as chaves locais.
cp .env.example .env
supabase status        # copie o SERVICE_ROLE_KEY para SUPABASE_SERVICE_ROLE_KEY
```

Depois escolha **um** dos jeitos de rodar a API:

```bash
# A) Em contêiner, como em produção
docker compose up --build

# B) Direto na máquina, com recarga automática
npm run dev
```

Confira em `http://localhost:3000/api/v1/health`. A resposta esperada é
`200 {"status":"ok","banco":"ok",...}`. Se vier `503`, a API subiu mas não alcançou o banco.

Para desligar: `docker compose down` e `supabase stop`.

### Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | API em modo desenvolvimento |
| `npm run build` | Build de produção (não precisa do `.env`) |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Checagem de tipos |
| `supabase db reset` | Recria o banco local do zero com migrations e seed |
| `supabase status` | URLs e chaves do Supabase local |

## Banco e dados de teste

As migrations ficam em `supabase/migrations/` (um arquivo por tabela, na ordem das dependências da
seção 5.3 da especificação) e o seed em `supabase/seed.sql`. `supabase db reset` recria tudo.
Os PDFs de exemplo das apólices estão em `supabase/seed/apolices/` e sobem para o bucket privado
`apolices` no `supabase start`.

Todas as tabelas têm RLS ligado e nenhuma policy: com a chave `anon` qualquer consulta volta vazia.
Só a API, com a `service_role`, lê e grava.

Usuários de teste (senha `Senha@123` para todos):

| E-mail | Papel | CPF | Para testar |
|---|---|---|---|
| `admin@bsseguros.com.br` | ADMIN | 11144477735 | Painel administrativo |
| `maria.souza@email.com` | SEGURADO | 52948220084 | 3 apólices, sinistro em análise, cotação respondida |
| `joao.silva@email.com` | SEGURADO | 22334455628 | Aniversário sempre na data do `db reset` (RF-08), apólice vencida |
| `ana.oliveira@email.com` | SEGURADO | 33445566739 | Apólice empresarial, sem aceite de marketing |
| `carlos.pereira@email.com` | SEGURADO | 44556677840 | Sinistro concluído, renovação de cotação pendente |
| `fernanda.costa@email.com` | SEGURADO | 55667788950 | Cliente nova, sem histórico |

Para o fluxo de vínculo no cadastro existe a apólice `AU-2026-000999` do CPF `99887766593`, sem conta.

## Variáveis de ambiente

Ver `.env.example`. O repositório nunca recebe o arquivo `.env` com valores.

| Variável | Obrigatória | Observação |
|---|---|---|
| `SUPABASE_URL` | sim | Local: `http://127.0.0.1:54321`. No compose é trocada para `host.docker.internal` |
| `SUPABASE_SERVICE_ROLE_KEY` | sim | Só no servidor; nunca no app |
| `CORS_ALLOWED_ORIGINS` | não | Origens separadas por vírgula; `*` é recusado |
| `COOKIE_SECURE` | não | Padrão `true`; `false` só em desenvolvimento sobre HTTP |
| `SUPABASE_JWT_SECRET` | não | Só se o projeto usar segredo HS256 |
| `INTERNAL_API_KEY` | não | Rota interna de push (Etapa 6) |

Variável obrigatória faltando: a API não sobe e lista o que falta. Variável vazia conta como
ausente.

## Problemas comuns

**`supabase start` falha com `'db' has invalid keys: orioledb_version`**
A CLI está desatualizada para o `supabase/config.toml` do projeto. Atualize a CLI ou use
`npx supabase@latest start`.

**Docker Desktop não sobe no Windows / WSL2 diz `HCS_E_HYPERV_NOT_INSTALLED`**
Falta o recurso "Plataforma de Máquina Virtual". No PowerShell como administrador:

```powershell
dism /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
bcdedit /set hypervisorlaunchtype auto
```

Reinicie o computador. A virtualização também precisa estar ligada na BIOS/UEFI.

**Contêiner não alcança o banco (`503` no health)**
Confira se o `supabase start` está rodando. Dentro do contêiner o Supabase é acessado por
`host.docker.internal:54321`, e o compose já faz essa troca.

## Fluxo de trabalho

- Cada pessoa trabalha em uma branch própria e abre Pull Request para a `main`.
- Migration que já foi para a `main` não se edita; correção vira uma migration nova.
