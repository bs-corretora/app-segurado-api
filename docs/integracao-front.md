# Integração do front com a API

Guia para quem está ligando as telas do app do segurado na API. O back-end está pronto e
publicado; aqui vai o que você precisa para trocar os dados de exemplo (`src/data.js`) por
chamadas de verdade.

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
3. Guarde os dois tokens: `localStorage` na web, `AsyncStorage` ou SecureStore no React Native.
4. Em toda chamada, mande o cabeçalho `Authorization: Bearer <access_token>`.
5. O `access_token` vale 1 hora. Quando uma chamada voltar **401**, chame
   `POST /auth/refresh` com `{ "refresh_token": "..." }`. A resposta traz tokens **novos**:
   substitua os dois, porque o refresh_token antigo só serve uma vez. Depois repita a chamada.
   Se o refresh também der 401, mande para a tela de login.
6. Sair: `POST /auth/logout` com o Bearer, e apague os tokens guardados.

O cadastro (`POST /auth/cadastro`) também já devolve os tokens, então a pessoa entra direto.

### Código pronto para copiar

Um arquivo `src/api.js` que faz tudo isso, inclusive a renovação automática:

```js
const API = 'https://app-segurado-api.onrender.com/api/v1';

const guardar = (t) => {
  localStorage.setItem('access_token', t.access_token);
  localStorage.setItem('refresh_token', t.refresh_token);
};
const limpar = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

export class ErroApi extends Error {
  constructor(status, corpo) {
    super(corpo?.mensagem ?? `Erro ${status}`);
    this.status = status;
    this.erro = corpo?.erro; // VALIDACAO, NAO_AUTENTICADO, ...
    this.campos = corpo?.campos ?? {}; // { campo: 'mensagem' } nos erros 400
  }
}

async function enviar(caminho, { method = 'GET', corpo } = {}) {
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

async function renovar() {
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
}

/** api('/dashboard'), api('/sinistros', { method: 'POST', corpo: {...} }) */
export async function api(caminho, opcoes) {
  let r = await enviar(caminho, opcoes);
  if (r.status === 401 && !caminho.startsWith('/auth/') && (await renovar())) {
    r = await enviar(caminho, opcoes);
  }
  if (r.status === 401 && !caminho.startsWith('/auth/')) {
    limpar();
    window.location.href = '/'; // ou navegar para a tela de login
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

No React Native, troque `localStorage` por `AsyncStorage`, que é assíncrono (use `await`).

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
| PDF da apólice | `GET /apolices/{id}/pdf` | devolve um link que vale 60 segundos: abra na hora |
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
| Perfil | `GET /me` | |
| Editar dados | `PATCH /me` | só `telefone` e `aceita_marketing` |
| Trocar senha | `PATCH /me/senha` `{senha_atual, nova_senha}` | 204; senha atual errada dá 400 |
| Sair | `POST /auth/logout` | |
| Push (só app nativo) | `POST /dispositivos`, `DELETE /dispositivos/{token}` | site não recebe push |

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

## 6. CORS: avise o endereço do seu front

O navegador só deixa o front chamar a API se o endereço do front estiver liberado no servidor.
Já liberados:

- `http://localhost:5173` (Vite)
- `http://localhost:3000`

Quando publicar o front (Vercel, Netlify, GitHub Pages), mande o endereço para o Everson
liberar. Sem isso, o navegador mostra erro de CORS no console e a chamada nem chega à API.

## 7. Painel administrativo

O painel do administrador não faz parte do app: fica dentro do repositório da API
(`src/app/admin`), no mesmo endereço, e usa cookie em vez de Bearer. As rotas estão no Swagger,
na seção Administração.
