# Como contribuir

O repositório segue o **GitHub Flow**: a `main` é sempre o que está no ar (cada merge publica no
Render) e todo trabalho passa por branch curta e Pull Request com o CI verde.

## Fluxo

1. **Issue primeiro.** Toda mudança começa numa issue, com o requisito (`RF-03`, `RNF-02`...) e o
   critério de aceite em Gherkin. Uma issue por problema pequeno.
2. **Branch a partir da `main` atualizada:**

   ```bash
   git switch main && git pull
   git switch -c feat/issue-NN-descricao-curta   # ou fix/, docs/, test/, ci/
   ```

3. **Commits pequenos** no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/),
   com o número da issue quando houver:

   ```text
   feat(sinistros): filtro por status no painel (#42)
   fix(auth): refresh aceita o token no corpo (#33)
   ```

   | Tipo | Quando usar |
   |---|---|
   | `feat` | funcionalidade nova |
   | `fix` | correção de bug |
   | `docs` | só documentação |
   | `test` | só testes |
   | `refactor` | muda o código sem mudar o comportamento |
   | `chore` | configuração, dependências, versão |
   | `ci` | GitHub Actions |

4. **Pull Request para a `main`** com `Closes #NN` na descrição. O modelo de PR já traz o checklist.
5. **CI verde antes do merge.** A `main` é protegida: sem PR e sem os checks passando, o merge não
   entra. Nada de upload de arquivo pelo site direto na `main`.
6. Depois do merge, a branch pode ser apagada; o deploy no Render é automático.

## Portões do CI

| Workflow | O que barra |
|---|---|
| CI › Lint, tipos e build | ESLint, `tsc --noEmit`, `next build` |
| CI › Testes unitários | regras de negócio por requisito, cobertura mínima de 80% |
| CI › Imagem Docker | o `Dockerfile` precisa buildar |
| CI › Migrations e seed | banco sobe do zero e o RLS fecha a chave anônima |
| CI › API ponta a ponta | os roteiros de `scripts/ci/` contra a API e um Supabase local |
| Segurança › Gitleaks | segredo em qualquer commit do histórico |
| Segurança › npm audit | dependência de produção com alerta alto ou crítico |

Além disso, o Dependabot abre PR toda segunda com as atualizações, e o GitHub bloqueia push que
contenha segredo conhecido.

## Testes

- O nome de cada teste começa pelo ID do requisito: `RF-03: recusa data de ocorrência no futuro`.
- Bug corrigido vem com o teste que falhava antes da correção.
- Mudou regra, rota ou dado pessoal: atualize `docs/` no mesmo PR.

## Antes de abrir o PR

```bash
npm run lint
npx tsc --noEmit
npm test
```

## Versões e release

Versões em [SemVer](https://semver.org/lang/pt-BR/). Enquanto o projeto está em `0.x`, cada marco é
uma versão `MINOR`. Para lançar:

1. PR que atualiza o `CHANGELOG.md`, a `version` do `package.json` e a versão do Swagger
   (`src/lib/openapi.ts`).
2. Depois do merge, tag anotada na `main` e Release no GitHub:

   ```bash
   git tag -a v0.5.0 -m "v0.5.0" && git push origin v0.5.0
   gh release create v0.5.0 --notes-from-tag
   ```
