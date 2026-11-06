# Visual das telas servidas pela API

Vale para as páginas que o Next.js deste repositório renderiza: a página pública de indicação
(`/indicacao/{codigo}`) e, depois, o painel administrativo (`/admin`). O app do segurado tem o
visual dele no repositório `app-segurado-mobile`; daqui só se reaproveita a paleta.

## Cores

Paleta tirada do logo da BS Seguros (mesma do protótipo do app).

| Token | Valor | Uso |
|---|---|---|
| `--marca` | `#494A99` | botão principal, título, links |
| `--marca-escura` | `#35366F` | botão no hover |
| `--ceu` | `#37A6DE` | detalhe decorativo; nunca texto sobre branco (contraste baixo) |
| `--texto` | `#1C1D2B` | texto principal (contraste 16:1 sobre o fundo) |
| `--texto-apoio` | `#4D4F63` | texto de apoio (contraste 8:1) |
| `--fundo` | `#F5F6FB` | fundo da página |
| `--cartao` | `#FFFFFF` | cartão do formulário |
| `--borda` | `#C9CBDD` | borda de campo |
| `--erro` | `#B42318` | mensagem de erro (contraste 6:1) |
| `--sucesso` | `#146C43` | mensagem de sucesso (contraste 6:1) |

Botão `--marca` com texto branco: contraste 7.7:1.

## Texto

Pilha do sistema (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`): página leve, sem
fonte para baixar.

| Degrau | Tamanho | Peso | Altura de linha |
|---|---|---|---|
| Título | 26px | 700 | 1.2 |
| Corpo, campo, botão | 16px | 600 (botão e rótulo), 400 só no texto corrido | 1.4 |
| Apoio | 14px | 500 | 1.4 |

Pisos: corpo nunca abaixo de 15px, apoio nunca abaixo de 11px, título e botão com peso ≥ 600,
`letter-spacing` negativo só acima de 24px e no máximo -0.5px.

## Movimento

Nenhum. Formulário de uso único: enviar troca o conteúdo do cartão sem animação.

## Estados

- Campo com erro: borda e mensagem em `--erro`, abaixo do campo.
- Enviando: botão desabilitado com o texto "Enviando…".
- Sucesso: o formulário some e fica a mensagem em `--sucesso`.
- Código inexistente ou falha de rede: mensagem em `--erro` acima do botão, formulário mantido.
