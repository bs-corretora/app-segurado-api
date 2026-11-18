# Changelog

Mudanças relevantes da API do App do Segurado. Formato baseado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versões em
[SemVer](https://semver.org/lang/pt-BR/). As versões até a 0.4.0 foram reconstruídas a partir
dos PRs mesclados.

## [0.5.0] - 2026-11-18

### Adicionado
- Painel administrativo: login, layout protegido e tela de sinistros com mudança de status (#29, #30).
- Camada de testes unitários das regras de negócio, com cobertura mínima no CI.
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
