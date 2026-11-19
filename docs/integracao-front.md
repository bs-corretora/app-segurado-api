# Integração do front com a API

Guia para quem está ligando as telas do app do segurado na API. O back-end está pronto e
publicado; aqui vai o que você precisa para trocar os dados de exemplo por chamadas de verdade
no app (PWA com Vite + React, repositório `app-segurado-mobile`).

## 1. Onde a API está

| O quê | Endereço |
|---|---|
| API | `https://app-segurado-api.onrender.com/api/v1` |
| Swagger (todas as rotas, com exemplo de resposta e botão de testar) | https://app-segurado-api.onrender.com/api/docs |
| Saúde da API | https://app-segurado-api.onrender.com/api/v1/health |

O deploy é automático: cada merge na `main` do `app-segurado-api` publica uma versão nova.

O Render gratuito dorme depois de um tempo sem uso. Se a primeira chamada demorar uns 30 a 60
segundos, é isso: espere e tente de novo. Um monitor chama a API a cada poucos minutos para
reduzir esses cochilos.

**Usuários de teste** (senha `Senha@123` para todos):

| E-mail | Para testar |
|---|---|
| `maria.souza@email.com` | 3 apólices, sinistro em análise, cotação respondida |
| `joao.silva@email.com` | apólice vencida |
| `ana.oliveira@email.com` | apólice empresarial |
| `carlos.pereira@email.com` | sinistro concluído |
| `fernanda.costa@email.com` | cliente nova, sem histórico |
| `admin@bsseguros.com.br` | painel administrativo (não usar no app) |

Os dados ficam no banco da nuvem e são compartilhados por todo mundo. Se você trocar a senha da
Maria ou abrir sinistros com ela, o resto da equipe vai ver. Para testar escrita à vontade,
crie uma conta sua pelo cadastro.

## 2. Login e sessão

A API usa **token Bearer**:

1. `POST /auth/login` com `{ "email": "...", "senha": "..." }`.
2. A resposta traz `access_token`, `refresh_token`, `expires_in` (3600 segundos) e `expires_at`.
3. Guarde os dois tokens no `localStorage` do navegador.
4. Em toda chamada, mande o cabeçalho `Authorization: Bearer <access_token>`.
5. O `access_token` vale 1 hora. Quando uma chamada voltar **401**, chame
   `POST /auth/refresh` com `{ "refresh_token": "..." }`. A resposta traz tokens **novos**:
   substitua os dois, porque o refresh_token antigo só serve uma vez. Depois repita a chamada.
   Se o refresh também der 401, mande para a tela de login.
6. Sair: `POST /auth/logout` com o Bearer, e apague os tokens guardados.

O cadastro (`POST /auth/cadastro`) também já devolve os tokens, então a pessoa entra direto.

Ao abrir o app, se houver token guardado, chame `GET /me`. Se responder 200, a pessoa já está
logada e pode ir direto para o Início.

Não use `credentials: 'include'` no `fetch`. O app entra só pelo Bearer; o cookie da API é do
painel administrativo e não funciona a partir de outro domínio.

### Código pronto para copiar

Crie `src/api.js`. Ele guarda os tokens, manda o Bearer, renova sozinho quando o token vence e
avisa o app quando a sessão acabou. Se várias telas receberem 401 ao mesmo tempo, só uma
renovação acontece: como o refresh_token só serve uma vez, duas renovações em paralelo
derrubariam a sessão.

```js
const API = import.meta.env.VITE_API_URL ?? 'https://app-segurado-api.onrender.com/api/v1';

function guardar(t) {
  localStorage.setItem('access_token', t.access_token);
  localStorage.setItem('refresh_token', t.refresh_token);
}
function limpar() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
}
export function temSessao() {
  return localStorage.getItem('access_token') !== null;
}

// O app registra aqui o que fazer quando a sessão acaba (ex.: ir para o login).
let aoSairDaSessao = () => {};
export function quandoSessaoAcabar(fn) {
  aoSairDaSessao = fn;
}

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.mensagem ?? `Erro ${status}`);
    this.status = status;
    this.erro = corpo?.erro; // VALIDACAO, NAO_AUTENTICADO, ...
    this.campos = corpo?.campos ?? {}; // { campo: 'mensagem' } nos erros 400
  }
}

function enviar(caminho, { method = 'GET', corpo } = {}) {
  const headers = {};
  const token = localStorage.getItem('access_token');
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(API + caminho, {
    method,
    headers,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
}

// Uma renovação por vez: quem chegar enquanto ela roda espera a mesma.
let renovando = null;
function renovar() {
  renovando ??= (async () => {
    const refresh_token = localStorage.getItem('refresh_token');
    if (!refresh_token) return false;
    const r = await fetch(API + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!r.ok) return false;
    guardar(await r.json());
    return true;
  })()
    .catch(() => false)
    .finally(() => {
      renovando = null;
    });
  return renovando;
}

/** await api('/dashboard'), await api('/sinistros', { method: 'POST', corpo: {...} }) */
export async function api(caminho, opcoes) {
  const deAuth = caminho.startsWith('/auth/');
  let r = await enviar(caminho, opcoes);
  if (r.status === 401 && !deAuth && (await renovar())) {
    r = await enviar(caminho, opcoes);
  }
  if (r.status === 401 && !deAuth) {
    limpar();
    aoSairDaSessao();
  }
  if (r.status === 204) return null;
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new ErroApi(r.status, corpo);
  return corpo;
}

export async function entrar(email, senha) {
  const r = await api('/auth/login', { method: 'POST', corpo: { email, senha } });
  guardar(r);
  return r;
}

export async function sair() {
  await api('/auth/logout', { method: 'POST' }).catch(() => null);
  limpar();
}
```

Como usar com o `useNav` do app:

```jsx
import { useEffect } from 'react';
import { useNav } from './nav';
import { api, entrar, quandoSessaoAcabar, ErroApi } from './api';

// uma vez, num componente dentro do NavProvider (ex.: o App):
const { go } = useNav();
useEffect(() => quandoSessaoAcabar(() => go('login')), []);

// na tela de login:
try {
  await entrar(email, senha);
  go('home');
} catch (e) {
  if (e instanceof ErroApi && e.status === 401) setErro('E-mail ou senha inválidos');
  else setErro(e.message);
}

// na tela de início:
const dados = await api('/dashboard');
```

Para apontar para uma API local, crie `.env.local` com
`VITE_API_URL=http://localhost:3000/api/v1`.

## 3. Rotas por tela

Todas as rotas abaixo exigem o Bearer, menos as marcadas como públicas. O formato exato de cada
resposta está no Swagger, com exemplo real.

| Tela | Chamada | Observação |
|---|---|---|
| Login | `POST /auth/login` | pública; 5 tentativas por minuto |
| Cadastro | `POST /auth/cadastro` | pública; com o número de uma apólice do mesmo CPF, já vincula as apólices |
| Esqueci a senha | `POST /auth/esqueci-senha` `{email}` | pública; responde 204 sempre (ver seção 5) |
| Início | `GET /dashboard` | nome, iniciais, tempo de casa, aniversário, não lidas, apólices ativas |
| Apólices | `GET /apolices` | lista paginada |
| Detalhe da apólice | `GET /apolices/{id}` | |
| PDF da apólice | `GET /apolices/{id}/pdf` | devolve um link que vale 60 segundos (ver seção 6) |
| Assistência 24h | `GET /contatos?tipo=ASSISTENCIA_24H` | telefone e WhatsApp |
| Contatos de sinistro | `GET /contatos?tipo=SINISTRO` | |
| Sinistros (lista) | `GET /sinistros` | mais recentes primeiro |
| Abrir sinistro | `POST /sinistros` | só de apólice ativa; data não pode ser futura |
| Detalhe do sinistro | `GET /sinistros/{id}` | com a linha do tempo de eventos |
| Cotações (lista) | `GET /cotacoes` | com a resposta da corretora quando houver |
| Pedir cotação | `POST /cotacoes` | nasce `RECEBIDA` |
| Detalhe da cotação | `GET /cotacoes/{id}` | |
| Indicar amigo | `GET /indicacoes/link` | link pronto para compartilhar |
| Minhas indicações | `GET /indicacoes` | |
| Notificações | `GET /notificacoes` | `?nao_lidas=true` para só as não lidas |
| Marcar como lida | `PATCH /notificacoes/{id}/lida` | |
| Assistente Virtual | `POST /assistente` | `{ mensagens: [{ papel, texto }] }` — histórico max 10; resposta: `{ resposta, fontes[], atalhos[] }`; rate limit 20/10min |
| Perfil | `GET /me` | |
| Editar dados | `PATCH /me` | só `telefone` e `aceita_marketing` |
| Trocar senha | `PATCH /me/senha` `{senha_atual, nova_senha}` | 204; senha atual errada dá 400 |
| Sair | `POST /auth/logout` | |

Sugestão de ordem para ligar: **login → início → apólices**. Com isso funcionando, o resto segue
o mesmo padrão.

## 4. Formato das respostas e dos erros

- **Sucesso:** o corpo é o próprio dado, sem envelope. `GET /me` devolve o perfil direto.
- **Listas** vêm assim: `{ "itens": [...], "pagina": 1, "limite": 20, "total": 3 }`. Para
  paginar, use `?pagina=2&limite=20` (limite máximo 50).
- **Datas:** `AAAA-MM-DD` para datas e ISO 8601 com fuso para data e hora.
- **Erro**, sempre neste formato:

  ```json
  { "status": 400, "erro": "VALIDACAO", "mensagem": "cpf inválido", "campos": { "cpf": "CPF inválido" } }
  ```

| Status | `erro` | O que fazer na tela |
|---|---|---|
| 400 | `VALIDACAO` | mostrar `campos[nome]` embaixo de cada campo |
| 401 | `NAO_AUTENTICADO` | renovar o token; se falhar, ir para o login |
| 403 | `SEM_PERMISSAO` | conta sem acesso (ex.: segurado em rota de admin) |
| 404 | `NAO_ENCONTRADO` | registro não existe ou é de outra pessoa |
| 409 | `CONFLITO` | regra de negócio (ex.: sinistro em apólice vencida); mostrar `mensagem` |
| 429 | `LIMITE_EXCEDIDO` | muitas tentativas; pedir para esperar um minuto |
| 503 | `INDISPONIVEL` | banco ou serviço fora; pedir para tentar de novo |

## 5. Esqueci a senha

1. O app chama `POST /auth/esqueci-senha` com o e-mail e mostra "se o e-mail tiver conta, você
   vai receber um link".
2. O e-mail traz um link que abre uma página da própria API
   (`https://app-segurado-api.onrender.com/redefinir-senha`), onde a pessoa cria a senha nova.
3. Depois ela volta ao app e entra com a senha nova. **O front não precisa fazer nenhuma tela
   para isso**, só a de pedir o link.

Limite: o e-mail gratuito do Supabase manda poucos e-mails por hora, para o projeto inteiro.
Teste com moderação; se não chegar, espere e tente mais tarde.

## 6. Notificações e PDF

- **Notificações:** as mensagens (sinistro mudou de status, cotação respondida, aniversário,
  campanhas) ficam em `GET /notificacoes`. O `GET /dashboard` já traz o total de não lidas para
  o sininho. Para mantê-lo em dia, chame de novo quando a pessoa voltar ao app
  (`document.addEventListener('visibilitychange', ...)`, com `document.visibilityState === 'visible'`).
- **Push com o app fechado não existe no PWA.** O envio de push da API é feito pelo serviço do
  Expo, que só funciona em app nativo. Não chamem `POST /dispositivos`.
- **PDF da apólice:** o link vale 60 segundos. No iPhone, `window.open` chamado depois de um
  `await` é bloqueado. Use `window.location.href = url`, ou abra a aba vazia no clique
  (`const aba = window.open('')`) e depois preencha `aba.location = url`.

## 9. Assistente Virtual

`POST /assistente`

Envie o histórico recente (máx. 10 mensagens) com `papel` (`usuario` ou `assistente`) e `texto`.

```ts
await api('/assistente', {
  method: 'POST',
  corpo: {
    mensagens: [
      { papel: 'usuario', texto: 'quando vence minha apólice de auto?' },
    ],
  },
});
```

Resposta:

```ts
{
  resposta: 'Sua apólice Auto (AU-2026-000184) vence em 01/10/2027.',
  fontes: [{ id: '6f1c1111-1111-1111-1111-111111111111', titulo: 'Apólice Auto' }],
  atalhos: [{ rotulo: 'Ver apólice', tela: '/apolices/6f1c1111-1111-1111-1111-111111111111' }]
}
```

- **Rate limit**: 20 perguntas a cada 10 minutos por usuário (429 se exceder).
- **Autenticação**: Bearer token obrigatório (401 se ausente/inválido).
- **503**: `GROQ_API_KEY` não configurada no servidor ou provedor de IA (Groq) fora do ar.
- **LGPD**: não persiste histórico nem loga conteúdo das mensagens.
- **Segurança**: isolamento por sessão — o modelo só acessa dados do usuário autenticado via tools de leitura.
- **Atalhos**: usem `tela` (ex.: `/apolices/...`) para navegar direto à tela.

O navegador só deixa o app chamar a API se o endereço do app estiver liberado no servidor.
Já liberados: `http://localhost:5173` (o `npm run dev` do Vite), `http://localhost:8081` e
`http://localhost:3000`.

O `vite preview` usa a porta 4173, que **não** está liberada. Para testar o build localmente,
rode `npx vite preview --port 5173`.

Quando o app for publicado (Vercel, Netlify, GitHub Pages...), mandem o endereço exato ao
Everson, com `https://` e sem barra no fim (ex.: `https://app-segurado.vercel.app`). Até ele
ser liberado, o app publicado recebe erro de CORS em todas as chamadas. Cada endereço precisa
ser liberado um por um: links de prévia que mudam a cada deploy não funcionam.

Se aparecer erro de CORS no console em `localhost:5173`, confira a aba Network antes de
concluir que é CORS: costuma ser a API acordando (espere a primeira chamada) ou a porta errada.

## 8. Painel administrativo

O painel do administrador não faz parte do app: vai ficar dentro do repositório da API
(`src/app/admin`, PRs #29 e #30), no mesmo endereço, usando cookie em vez de Bearer. As rotas
de administração já estão no ar e podem ser testadas pelo Swagger, na seção Administração,
entrando com `admin@bsseguros.com.br`.
