# Dados sensíveis e LGPD

Levantamento do que a API guarda e expõe sobre os segurados (issue #64), com o que o painel
mostra mascarado (issue #62). Atualize este arquivo no mesmo PR de qualquer mudança em dado
pessoal, rota ou log (ver `CONTRIBUTING.md`).

## O que guardamos e por quê

| Dado | Tabela / coluna | Para que serve | Como é guardado |
|---|---|---|---|
| CPF | `perfil.cpf`, `apolice.cpf_titular` | Ligar o cadastro à apólice do titular (RF-01) e identificar o segurado no atendimento | 11 dígitos, validados pelos dígitos verificadores |
| Telefone | `perfil.telefone` | Contato da corretora com o segurado | só dígitos |
| Data de nascimento | `perfil.data_nascimento` | Aviso de aniversário e dados do perfil | `DATE` |
| E-mail | `auth.users.email` (Supabase Auth) | Login e redefinição de senha | gerido pelo Supabase Auth; a API só o lê |
| Sinistros | `sinistro`, `sinistro_evento` | Abrir e acompanhar o sinistro (RF-04) | tipo, data, local, descrição livre e linha do tempo |
| Cotações | `cotacao.dados` | Atender o pedido de cotação | JSON plano enviado pelo app; pode conter dados do bem a segurar |
| Indicações | `indicacao` | Contatar quem foi indicado | nome, telefone e e-mail do indicado, enviados por quem indicou |
| Token de aparelho | `dispositivo` | Enviar notificação push | token do Expo |
| Aceite de marketing | `perfil.aceita_marketing` | Decidir quem recebe campanha | booleano; ver abaixo |

Senha nunca passa pela nossa base: fica no Supabase Auth, com hash.

## Quem vê

- **O próprio segurado** vê só os seus dados. Toda consulta do app filtra por `perfil_id` e um
  registro de outra pessoa responde **404** (não 403), para não confirmar que ele existe.
- **A equipe da corretora** (papel `ADMIN`) vê segurados, cotações, sinistros e indicações pelo
  painel e pelas rotas `/api/v1/admin/*`. Segurado nessas rotas recebe 403.
- **O banco** fecha a chave anônima por RLS; a API usa a chave de serviço só no servidor.
- **Terceiros**: o Expo recebe o token do aparelho e o texto da notificação (título e mensagem,
  que citam protocolo, nunca CPF ou telefone); o Supabase Auth envia o e-mail de redefinição;
  o assistente virtual (Groq) recebe a pergunta digitada pelo segurado.

## Onde aparece mascarado ou formatado

O banco e a API continuam com dígitos puros. Quem formata é só a tela do painel
(`src/lib/formato.ts`), com o mesmo padrão em todas as telas:

| Dado | Lista (Segurados) | Detalhe do segurado | Cotações e Indicações |
|---|---|---|---|
| CPF | `***.877.665-**` | `998.877.665-93` | `***.877.665-**` (campo de `dados` com "cpf" no nome) |
| Telefone | `(81) 99876-5432` | `(81) 99876-5432` | `(81) 99876-5432` |

Por que o detalhe mostra o CPF inteiro: ele só abre com um clique deliberado de quem já está
logado como administrador, e o atendimento precisa conferir o CPF com a apólice e com a
seguradora. Na lista, onde dezenas de CPFs ficam na tela ao mesmo tempo, o CPF fica parcial.
Telefone não é mascarado: é o que o atendimento usa para ligar.

Atenção: as rotas `/api/v1/admin/*` devolvem o CPF completo (a máscara é de exibição). Quem
consome a API de administração fora do painel precisa tratar o dado como pessoal.

## Logs

- `comLog` registra só método, caminho, status e duração. Nunca corpo, query string nem cookie.
  O token do aparelho, que viaja no caminho de `DELETE /dispositivos/{token}`, sai como `:token`.
- `falhaBanco` registra a falha do banco depois de passar por `redigir`
  (`src/lib/formato.ts`), que troca CPF, e-mail, telefone e sequências longas de dígitos por
  `[cpf]`, `[email]`, `[telefone]` e `[numero]`. Sem isso, o `details` do Postgres numa chave
  duplicada (`Key (cpf)=(99887766593) already exists`) iria inteiro para o log.
- A resposta HTTP não muda: continua 503 com mensagem genérica.

## Acesso a dado de outro usuário

| Rota do app | Teste |
|---|---|
| `GET /sinistros/{id}` | `etapa4.sh` |
| `GET /cotacoes`, `GET /cotacoes/{id}` | `etapa4.sh`, `fechamento.sh`, `sensiveis.sh` |
| `POST /sinistros` com apólice alheia | `etapa4.sh` |
| `DELETE /dispositivos/{token}` | `etapa6.sh` |
| `GET /apolices`, `GET /apolices/{id}`, `GET /apolices/{id}/pdf` | `sensiveis.sh` |
| `GET /sinistros` (lista) | `sensiveis.sh` |
| `GET /notificacoes`, `PATCH /notificacoes/{id}/lida` | `sensiveis.sh` |
| `GET /indicacoes` | `sensiveis.sh` |
| `GET /me`; rotas `/admin/*` com segurado | `sensiveis.sh` |

`GET /dashboard`, `/contatos`, `/indicacoes/link` e `/dispositivos` (POST) não recebem id de
outra pessoa: usam só o `perfil_id` da sessão.

## Aceite de marketing

O aceite só vale com escolha explícita do segurado, nunca marcado por padrão. Isso é tratado na
issue #61 (PR separado); este documento passa a descrever o comportamento final quando ela entrar.

## Retenção

A definir com a corretora. O repositório não tem política de retenção nem rotina de exclusão, e
nenhum prazo foi assumido aqui. Quando houver, registrar: prazo por tipo de dado (cadastro,
sinistros, cotações, indicações), o que acontece quando o segurado pede a exclusão e como a
rotina é executada.

## Pendências

- Fora deste PR (serviço e esquemas em ajuste na #63): conferir se `cadastro.ts` e os esquemas
  de validação devolvem em mensagem de erro o CPF ou o e-mail digitado.
