# Plano de implementação do back-end

Guia para começar e conduzir o back-end do App do Segurado: o que construir, em que ordem,
como saber que cada etapa está pronta e o que o app mobile espera receber.

A referência de regras é a [especificação técnica](especificacao-tecnica.md). Este plano não
repete a especificação: ele organiza a execução e aponta a seção certa para cada etapa.

## 1. Antes de começar

Leitura obrigatória na especificação:

| Seção | Por quê |
|---|---|
| 2. Arquitetura | A API é a única porta de entrada; nenhuma chave do Supabase vai para o app |
| 5. Modelo de dados | Tabelas, colunas e restrições das migrations |
| 6. API | Rotas, paginação e formato de erro |
| 7. Segurança | Cookies, rate limit e CORS (RNF-01, RNF-02, RNF-03) |

Ferramentas na máquina: Node.js 22, Docker Desktop, Supabase CLI e Git.

### 1.1 Por que esta stack

A BS Labs liberou Node.js, Express, React e Next.js. A escolha foi:

| Parte | Tecnologia | Repositório |
|---|---|---|
| API, painel administrativo e página pública de indicação | Next.js (TypeScript) | `app-segurado-api` |
| Banco, autenticação e arquivos | Supabase (PostgreSQL) | `app-segurado-api` (`supabase/`) |
| Aplicativo do segurado | React Native com Expo | `app-segurado-mobile` |

Quem cuida do back-end cuida também do painel administrativo e da página pública (estão no
mesmo projeto) e da conta do Supabase Cloud.

Motivos:

- **Um projeto só para tudo que é web.** API, painel e página pública ficam no mesmo Next.js:
  um `package.json`, um contêiner, um deploy no Render. Com Express na API, o painel precisaria
  de um segundo projeto, um segundo deploy e um proxy entre os dois.
- **Cookies de sessão funcionam sem ajuste.** A sessão usa cookies `SameSite=Strict`
  (seção 7.1 da especificação). Painel e API no mesmo domínio recebem o cookie normalmente; em
  domínios separados no Render, o navegador não o enviaria.
- **O painel continua sendo React.** As telas do Next.js são componentes React, a mesma base do
  React Native do app.
- **Express não entra.** Ele resolveria só a API, e as rotas do Next.js (Route Handlers) cobrem
  o que a especificação pede: validação com Zod, cookies, CORS e rate limit.

### 1.2 Decisões que valem para todo o código


- **TypeScript em modo `strict`**, Next.js com App Router.
- **JSON da API em `snake_case`**, com os mesmos nomes das colunas do banco (`data_nascimento`,
  `fim_vigencia`). Evita uma camada de conversão e mantém o contrato igual ao modelo de dados.
- **Datas trafegam em ISO 8601** (`2026-10-10` para `date`, `2026-10-03T14:20:00-03:00` para
  `timestamptz`). Quem formata para "10/10/2026" é o app.
- **Enumerações em maiúsculas** (`ATIVA`, `EM_ANALISE`). O texto exibido ("Em análise") é do app.
- **Toda rota valida a entrada com Zod** antes de chamar o serviço. O mesmo schema gera o OpenAPI.
- **Erro sempre no formato da seção 6.12** da especificação.

## 2. O que o app espera: telas do protótipo × rotas

O protótipo do app já tem as telas abaixo. Esta tabela é o contrato mínimo entre front e back.

| Tela | Rota | O que a tela usa |
|---|---|---|
| Login | `POST /auth/login` | e-mail e senha; cookies de sessão na resposta |
| Login → Esqueci minha senha | `POST /auth/esqueci-senha` | e-mail |
| Login → Criar conta | `POST /auth/cadastro` | nome, CPF, e-mail, telefone, nascimento, senha, número de apólice (opcional), aceite dos termos |
| Início | `GET /dashboard` | nome e iniciais, tempo de casa ("3 anos e 4 meses"), aniversário, apólices ativas, não lidas |
| Início → Ver todas as apólices | `GET /apolices` | produto, número, status, vigência |
| Detalhe da apólice | `GET /apolices/{id}` e `GET /apolices/{id}/pdf` | dados da apólice e URL do PDF |
| Cotação | `GET /cotacoes` e `POST /cotacoes` | pedidos com produto, motivo, data e status |
| Sinistro | `GET /contatos?tipo=SINISTRO`, `GET /sinistros`, `POST /sinistros` | contato da equipe, lista com protocolo e status, abertura |
| Assistência | `GET /contatos?tipo=ASSISTENCIA_24H` | um cartão por produto com telefone e WhatsApp |
| Notificações (sino) | `GET /notificacoes`, `PATCH /notificacoes/{id}/lida` | título, mensagem, lida ou não, destino ao tocar |
| Configurações → Dados cadastrais | `GET /me`, `PATCH /me` | dados do perfil |
| Configurações → Indique amigos / Início → Indicar | `GET /indicacoes/link`, `GET /indicacoes` | link para compartilhar e indicações feitas |
| Configurações → Sair | `POST /auth/logout`, `DELETE /dispositivos/{token}` | encerra a sessão |

### 2.1 Exemplos de resposta

Formatos de referência para o app trabalhar com dados falsos enquanto a API não existe. A API
devolve exatamente esta forma.

`GET /api/v1/dashboard`

```json
{
  "nome": "Maria Souza",
  "iniciais": "MS",
  "tempo_de_casa": { "anos": 3, "meses": 4 },
  "aniversario_hoje": false,
  "nao_lidas": 4,
  "apolices_ativas": [
    {
      "id": "6f1c…",
      "produto": "AUTO",
      "numero": "AU-2026-000184",
      "status": "ATIVA",
      "inicio_vigencia": "2026-10-01",
      "fim_vigencia": "2027-10-01"
    }
  ]
}
```

`GET /api/v1/sinistros?pagina=1&limite=20`

```json
{
  "itens": [
    {
      "id": "a7d2…",
      "protocolo": "SIN-2026-000123",
      "tipo": "COLISAO",
      "produto": "AUTO",
      "status": "EM_ANALISE",
      "criado_em": "2026-10-03T14:20:00-03:00"
    }
  ],
  "pagina": 1,
  "limite": 20,
  "total": 1
}
```

Toda lista usa o envelope `{ itens, pagina, limite, total }`.

`GET /api/v1/cotacoes`

```json
{
  "itens": [
    {
      "id": "c31e…",
      "produto": "RESIDENCIAL",
      "motivo": "NOVO",
      "status": "RESPONDIDA",
      "resposta": "Plano básico a partir de R$ 39,90/mês.",
      "valor_estimado": 478.80,
      "criado_em": "2026-10-03T10:00:00-03:00",
      "respondida_em": "2026-10-04T16:30:00-03:00"
    }
  ],
  "pagina": 1,
  "limite": 20,
  "total": 1
}
```

`GET /api/v1/contatos?tipo=ASSISTENCIA_24H`

```json
{
  "itens": [
    { "id": "1b0a…", "produto": "AUTO", "rotulo": "Assistência 24h - Auto",
      "telefone": "8100000000", "whatsapp": "5581900000000" }
  ]
}
```

`GET /api/v1/notificacoes`

```json
{
  "itens": [
    {
      "id": "9e44…",
      "tipo": "SISTEMA",
      "titulo": "Seu sinistro mudou de status",
      "mensagem": "SIN-2026-000123 está em análise.",
      "destino_tipo": "SINISTRO",
      "destino_id": "a7d2…",
      "lida_em": null,
      "criado_em": "2026-10-05T09:00:00-03:00"
    }
  ],
  "pagina": 1,
  "limite": 20,
  "total": 1
}
```

## 3. Ordem de construção

Cada etapa termina em algo que roda e pode ser conferido. Não avançar com a anterior quebrada.

### Etapa 0 — Esqueleto do projeto

- `npx create-next-app@latest` com TypeScript, App Router e ESLint, na raiz deste repositório.
- `next.config` com `output: 'standalone'`.
- `supabase init` (cria a pasta `supabase/`).
- `Dockerfile` multi-stage (`node:22-alpine`, usuário não root, porta 3000) e
  `docker-compose.yml` da API.
- Utilitários base: leitura e validação do `.env` com Zod (a API não sobe com variável
  faltando), resposta de erro padrão e paginação.
- `GET /api/v1/health` consultando o banco.

**Pronto quando:** `supabase start` e `docker compose up --build` sobem do zero e
`GET /api/v1/health` responde `200`.

### Etapa 1 — Banco

- Uma migration por tabela da seção 5.3, na ordem das dependências: `perfil`, `apolice`,
  `contato_assistencia`, `sinistro`, `sinistro_evento`, `cotacao`, `indicacao`, `notificacao`,
  `dispositivo` (`cobertura` fica para o P2).
- Coluna extra em `cotacao`: `motivo varchar(20)` com `NOVO | RENOVACAO` (ver seção 5).
- RLS ligado em todas as tabelas, sem policy para `anon` e `authenticated`.
- `CHECK` para todo domínio (`status`, `produto`, `papel`), não só na aplicação.
- Protocolo de sinistro gerado no banco: sequência + formato `SIN-AAAA-NNNNNN`.
- Bucket privado `apolices` no Storage.
- `supabase/seed.sql` com tudo da seção 5.5 da especificação, incluindo usuários em
  `auth.users` com senha conhecida e PDFs de exemplo.

**Pronto quando:** `supabase db reset` recria o banco com o seed sem erro, e uma consulta com a
chave `anon` em qualquer tabela volta vazia.

### Etapa 2 — Autenticação e sessão

- `POST /auth/cadastro`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/esqueci-senha`,
  `GET` e `PATCH /me`.
- Cookies conforme a seção 7.1: os tokens nunca aparecem no corpo da resposta.
- Middleware que valida o JWT e entrega `perfil_id` e `papel` às rotas.
- Rate limit (seção 7.2) e CORS (seção 7.3).
- Validações do cadastro da seção 6.3: CPF com dígito verificador, 18 anos, senha com no
  mínimo 8 caracteres, aceite dos termos, conflito com mensagem genérica.

**Pronto quando:** com um usuário do seed, login → `GET /me` → logout funciona por cookie; a 6ª
tentativa de login no mesmo minuto recebe `429` com `Retry-After`; sem cookie, `GET /me` recebe
`401`.

### Etapa 3 — Leitura do app

- `GET /dashboard`, `/apolices`, `/apolices/{id}`, `/apolices/{id}/pdf` (URL assinada de 60 s),
  `/contatos`, `/notificacoes`, `PATCH /notificacoes/{id}/lida`.
- Isolamento: registro de outro perfil responde `404`, nunca `403`.

**Pronto quando:** as telas Início, Assistência e Notificações do protótipo podem ser
preenchidas só com dados reais da API, e o usuário A não enxerga nada do usuário B.

### Etapa 4 — Escrita do app

- `POST /sinistros` (grava o evento `ABERTO` na mesma transação), `GET /sinistros`,
  `GET /sinistros/{id}` com linha do tempo.
- `POST` e `GET /cotacoes`.
- `GET /indicacoes/link`, `GET /indicacoes`, `POST /public/indicacoes/{codigo}` e a página
  pública `app/indicacao/[codigo]` com o formulário do indicado.
- `POST /dispositivos`, `DELETE /dispositivos/{token}`.

**Pronto quando:** abrir um sinistro devolve o protocolo e ele aparece na lista como
`ABERTO`; usuário sem apólice ativa não consegue abrir sinistro.

### Etapa 5 — Administração

- Rotas `/admin/*` da seção 6.10, todas exigindo papel `ADMIN`.
- Mudança de status de sinistro e resposta de cotação gravam a `notificacao` do segurado.
- Telas do painel administrativo em `app/admin/` consumindo essas rotas.

**Pronto quando:** o administrador muda um sinistro para `EM_ANALISE` e o segurado vê a
notificação "Seu sinistro mudou de status" e o novo evento na linha do tempo.

### Etapa 6 — Jobs e push

- Job pg_cron de aniversário (seção 5.4).
- `POST /internal/push/pendentes` enviando pelo Expo Push e marcando `push_enviado_em`.
- Campanhas (`POST /admin/campanhas`) respeitando `aceita_marketing`.

**Pronto quando:** o perfil de aniversário do seed recebe a notificação no dia, e uma campanha
não chega a quem desativou marketing.

### Etapa 7 — Documentação e deploy

- `/api/docs` (Swagger UI) e `/api/openapi.json` gerados dos schemas Zod.
- Projeto no Supabase Cloud, criado pelo responsável do back-end, com as migrations aplicadas
  (`supabase link` + `supabase db push`). Os outros integrantes entram como membros da
  organização no Supabase, sem compartilhar login.
- Chaves do Supabase (`SUPABASE_SERVICE_ROLE_KEY` principalmente) vão só para as variáveis de
  ambiente do Render e para o `.env` local de quem precisa, passadas por mensagem privada.
  Nunca em commit, issue ou grupo aberto.
- API no Render a partir do `Dockerfile`.
- README com os usuários de teste do seed.

**Pronto quando:** o app mobile, apontando `EXPO_PUBLIC_API_URL` para o Render, faz login e
carrega o Início.

Depois do P1: camada de IA (assistente do segurado e triagem de sinistro, com os prompts
versionados em `lib/ai/prompts/`) e itens P2 da especificação.

## 4. Como o front pode andar em paralelo

1. Ao fim da Etapa 0, publicar os exemplos da seção 2.1 como contrato. O app usa dados falsos
   com essa forma.
2. Ao fim da Etapa 2, o app já troca o login falso pelo real.
3. Cada etapa seguinte libera um grupo de telas. Avisar no PR quais rotas ficaram disponíveis.

Mudança no formato de uma resposta já publicada se combina com o front antes do merge.

## 5. Decisões tiradas do protótipo

Pontos que aparecem nas telas e não constavam da especificação. Estão decididos e já
refletidos na especificação; mudar algum deles se combina com o front antes.

| Tela | O que aparece | Decisão |
|---|---|---|
| Cotação | Pedido marcado como "Novo seguro" ou "Renovação" | Coluna `motivo` (`NOVO` \| `RENOVACAO`) em `cotacao`, no P1. O app envia o motivo no `POST /cotacoes` |
| Notificações | "Renovação em 30 dias" | O aviso automático continua P2. No P1, notificações de renovação vêm do seed, com `destino_tipo = APOLICE` |
| Início (versão antiga) | Cartão com imagem e informações do veículo | Fora do P1 (a versão atual do Início já não tem o cartão). Se voltar, entra como `detalhes jsonb` em `apolice` |
| Início | Avatar com iniciais | A API devolve `iniciais` no `/dashboard` e no `/me`: primeira letra do primeiro e do último nome |
| Sinistro | Protocolo `SIN-2026-000123` | Formato `SIN-AAAA-NNNNNN` (ano da abertura + sequência de 6 dígitos), gerado no banco |
| Apólices | Número `AU-2026-…`, `VI-2026-…` | Formato `PP-AAAA-NNNNNN`, com prefixo por produto: `AU`, `RE`, `VI`, `EM`. Gerado no seed |



## 6. Regras de trabalho no repositório

- Branch por assunto e Pull Request para a `main`. Nada de push direto na `main`.
- `git pull` antes de começar a editar.
- Migration que já está na `main` não se edita. Correção é uma migration nova.
- O `.env` com valores nunca entra no repositório. Variável nova entra no `.env.example` no
  mesmo PR.
- Commits no formato `tipo: descrição` (`feat`, `fix`, `docs`, `chore`, `refactor`, `test`).

Checklist de todo PR:

- [ ] Roda do zero com `supabase db reset` e `docker compose up --build`.
- [ ] Rotas novas validam a entrada com Zod e aparecem no `/api/docs`.
- [ ] Rotas de usuário retornam `404` para registro de outro perfil.
- [ ] Rotas `/admin/*` retornam `403` para quem não é `ADMIN`.
- [ ] Nenhum segredo no código ou no histórico.
