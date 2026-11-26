# Changelog

Mudanças relevantes da API do App do Segurado. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versões em
[SemVer](https://semver.org/lang/pt-BR/). As versões até a 0.4.0 foram reconstruídas a partir
dos PRs mesclados.

## [Não lançado]

### Adicionado
- Confirmação de e-mail no cadastro com código de 6 dígitos: `POST /auth/confirmar-email` (confirma
  e inicia a sessão) e `POST /auth/reenviar-codigo` (204 sempre). O código é gerado e conferido pelo
  Supabase Auth e enviado pela API pelo Resend (#71).
- Avisos por e-mail quando o status do sinistro muda e quando a cotação é respondida, com fila em
  `notificacao` (`email_enviado_em`, `email_tentativas`), envio na hora pela rota do admin e reenvio
  por `POST /internal/email/pendentes` a cada 15 minutos, até 3 tentativas (#72).
- Modelos de e-mail em `src/lib/email/` (HTML compatível com Gmail e Outlook e versão em texto) e
  prévia com `npm run emails:previa`. Variáveis `RESEND_API_KEY` e `EMAIL_REMETENTE` (#71).

### Corrigido
- Assistente virtual: o prompt de sistema passa a proibir afirmar ou prometer que um sinistro será pago e confirmar cobertura, orientando a acompanhar o sinistro no app e falar com a equipe e a corretora (#69).

### Alterado
- `POST /auth/cadastro` não inicia mais a sessão: responde 201 com `confirmar_email: true` e sem
  tokens. `POST /auth/login` de conta não confirmada responde 403 `EMAIL_NAO_CONFIRMADO` (#71).
- `POST /auth/esqueci-senha` gera o link pelo Supabase Auth e envia o e-mail pelo Resend, com
  limite de 3 pedidos a cada 15 minutos por e-mail; o link continua abrindo `/redefinir-senha` (#71).
- Painel: CPF mascarado na lista de segurados (`***.877.665-**`), completo e formatado no detalhe,
  telefone como `(81) 99876-5432` em Segurados, Cotações e Indicações (#62).
- Logs: erros do banco passam por redação de CPF, e-mail e telefone; o token do aparelho não vai
  mais no caminho registrado. Novo `docs/dados-sensiveis.md` e roteiro `scripts/ci/sensiveis.sh` (#64).
- Assistente virtual passa a usar a Groq (`GROQ_API_KEY`, modelo `openai/gpt-oss-120b`) no lugar
  da Anthropic; falha do provedor responde 503 (#57).

## [0.5.0] - 2026-11-18

### Adicionado
- Painel administrativo: login, layout protegido e tela de sinistros com mudança de status (#29, #30).
- Camada de testes unitários das regras de negócio: 70 testes nomeados pelo requisito, com
  cobertura mínima de 80% no CI (#46).
- Workflow de segurança: Gitleaks no histórico, `npm audit` das dependências de produção e
  Dependabot semanal (#40).
- `CONTRIBUTING.md` com o GitHub Flow, modelos de PR e de issue.

### Alterado
- Guia de integração do front reescrito para o PWA (Vite + React) (#37).

### Corrigido
- Next 16.4.6 e Zod 4.6.7 por alertas de segurança (#38).
- Título padrão nas páginas renderizadas pela API (#39).

## [0.4.0] - 2026-11-11

### Adicionado
- Login por token Bearer para o front em outro domínio, troca e redefinição de senha,
  `GET /cotacoes/{id}` e `GET /admin/resumo` (#35).
- Guia de integração do front (#35, #36).

## [0.3.0] - 2026-11-06

### Adicionado
- Escrita do app: sinistros, cotações, indicações e perfil (#23, #25).
- Jobs de aniversário e push (#24).
- Rotas de administração (#27).
- Blueprint do Render e roteiro de deploy (#26).

### Corrigido
- Link de indicação no Render e monitor que mantém a API acordada (#28).

## [0.2.0] - 2026-10-29

### Adicionado
- Autenticação e sessão (#17).
- Rotas de leitura do app (#20).
- Swagger em `/api/docs` e diagrama do banco (#19).
- Log de cada requisição no contêiner (#22).
- Migrations e dados de exemplo (#15) e CI com lint, tipos, build, Docker e banco (#16).

## [0.1.0] - 2026-10-15

### Adicionado
- Especificação técnica e plano do back-end (#1).
- Projeto Next.js com Docker, Supabase e health check (#10, #11, #13).

### Corrigido
- Variável de ambiente vazia passa a contar como ausente (#12).
