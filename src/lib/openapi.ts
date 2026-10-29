import { z } from 'zod';
import { atualizarMeSchema, cadastroSchema, esqueciSenhaSchema, loginSchema } from '@/lib/schemas/conta';

// Especificação OpenAPI 3.1 (seção 6.11). Os corpos de entrada saem dos mesmos
// schemas Zod que as rotas usam para validar; as respostas trazem exemplos do seed.

type Schema = Record<string, unknown>;

/** JSON Schema da entrada (antes dos transforms), sem o $schema de topo. */
function entrada(schema: z.ZodType): Schema {
  const gerado = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Schema;
  delete gerado.$schema;
  return gerado;
}

const json = (schema: Schema, example?: unknown) => ({
  'application/json': { schema, ...(example !== undefined ? { example } : {}) },
});

const corpo = (schema: z.ZodType, example: unknown) => ({
  required: true,
  content: json(entrada(schema), example),
});

const resposta = (descricao: string, example?: unknown) => ({
  description: descricao,
  ...(example !== undefined ? { content: json({ type: 'object' }, example) } : {}),
});

const ref = (nome: string) => ({ $ref: `#/components/responses/${nome}` });

const parametroId = (nome: string) => ({
  name: 'id',
  in: 'path',
  required: true,
  description: `id da ${nome}`,
  schema: { type: 'string', format: 'uuid' },
});

const paginacao = [
  { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
];

const autenticada = { security: [{ cookieSessao: [] }] };
const publica = { security: [] };

const APOLICE = {
  id: '6f1c1111-1111-1111-1111-111111111111',
  produto: 'AUTO',
  numero: 'AU-2026-000184',
  status: 'ATIVA',
  inicio_vigencia: '2026-10-01',
  fim_vigencia: '2027-10-01',
};

const NOTIFICACAO = {
  id: '9e441111-1111-1111-1111-111111111111',
  tipo: 'SISTEMA',
  titulo: 'Seu sinistro mudou de status',
  mensagem: 'SIN-2026-000123 está em análise.',
  destino_tipo: 'SINISTRO',
  destino_id: 'a7d21111-1111-1111-1111-111111111111',
  lida_em: null,
  criado_em: '2026-10-04T12:00:00+00:00',
};

const PERFIL = {
  id: '22222222-2222-2222-2222-222222222222',
  nome: 'Maria Souza',
  cpf: '52948220084',
  telefone: '81988881111',
  data_nascimento: '1992-06-20',
  cliente_desde: '2023-06-01',
  papel: 'SEGURADO',
  codigo_indicacao: 'MARIA123',
  aceita_marketing: true,
  termos_aceitos_em: '2026-10-29T21:46:32+00:00',
  criado_em: '2026-10-29T21:46:32+00:00',
  email: 'maria.souza@email.com',
};

export function especificacaoOpenApi() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'App do Segurado — API',
      version: '0.3.0',
      description:
        'API do App do Segurado. A sessão é por cookie HttpOnly: faça `POST /auth/login` aqui mesmo ' +
        'e as rotas autenticadas passam a funcionar nesta página. Usuários de teste no README ' +
        '(senha `Senha@123`).',
    },
    servers: [{ url: '/api/v1' }],
    tags: [
      { name: 'Infraestrutura' },
      { name: 'Autenticação e conta' },
      { name: 'Início' },
      { name: 'Apólices' },
      { name: 'Assistência' },
      { name: 'Notificações' },
    ],
    components: {
      securitySchemes: {
        cookieSessao: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'Gravado pelo login. HttpOnly: o navegador envia sozinho.',
        },
      },
      responses: {
        NaoAutenticado: resposta('Sessão ausente ou expirada', {
          status: 401,
          erro: 'NAO_AUTENTICADO',
          mensagem: 'Sessão ausente ou expirada',
        }),
        Validacao: resposta('Entrada inválida', {
          status: 400,
          erro: 'VALIDACAO',
          mensagem: 'cpf inválido',
          campos: { cpf: 'CPF inválido' },
        }),
        NaoEncontrado: resposta('Registro inexistente ou de outro usuário', {
          status: 404,
          erro: 'NAO_ENCONTRADO',
          mensagem: 'Apólice não encontrada',
        }),
        LimiteExcedido: resposta('Limite de requisições excedido (cabeçalho Retry-After)', {
          status: 429,
          erro: 'LIMITE_EXCEDIDO',
          mensagem: 'Muitas tentativas. Tente novamente em instantes.',
        }),
      },
    },
    security: [{ cookieSessao: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['Infraestrutura'],
          summary: 'Estado da API e do banco',
          ...publica,
          responses: {
            200: resposta('API e banco no ar', {
              status: 'ok',
              banco: 'ok',
              timestamp: '2026-10-29T21:47:10.023Z',
            }),
            503: resposta('Banco indisponível'),
          },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Autenticação e conta'],
          summary: 'Entrar (grava os cookies de sessão)',
          description: 'Tokens só em cookie, nunca no corpo. 5 tentativas por minuto por IP.',
          ...publica,
          requestBody: corpo(loginSchema, { email: 'maria.souza@email.com', senha: 'Senha@123' }),
          responses: {
            200: resposta('Sessão iniciada', { id: PERFIL.id, email: PERFIL.email }),
            400: ref('Validacao'),
            401: resposta('E-mail ou senha inválidos'),
            429: ref('LimiteExcedido'),
          },
        },
      },
      '/auth/cadastro': {
        post: {
          tags: ['Autenticação e conta'],
          summary: 'Criar conta, vincular apólices e entrar',
          description:
            'O vínculo exige CPF e o número de uma apólice do mesmo titular. Conflito de CPF ou ' +
            'e-mail responde 409 sem dizer qual dos dois. 3 por minuto por IP.',
          ...publica,
          requestBody: corpo(cadastroSchema, {
            nome: 'Paulo Lima',
            cpf: '99887766593',
            email: 'paulo.lima@email.com',
            telefone: '81977776666',
            data_nascimento: '1990-01-01',
            senha: 'Senha@1234',
            numero_apolice: 'AU-2026-000999',
            aceite_termos: true,
          }),
          responses: {
            201: resposta('Conta criada e sessão iniciada', {
              id: 'c26c07d0-4520-447d-b0c7-0d54e784f6a1',
              apolices_vinculadas: 1,
            }),
            400: ref('Validacao'),
            409: resposta('CPF ou e-mail já cadastrado'),
            429: ref('LimiteExcedido'),
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Autenticação e conta'],
          summary: 'Renovar a sessão pelo cookie de refresh',
          ...publica,
          responses: {
            200: resposta('Sessão renovada', { renovada: true }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Autenticação e conta'],
          summary: 'Sair (apaga os cookies)',
          ...autenticada,
          responses: { 204: resposta('Sessão encerrada'), 401: ref('NaoAutenticado') },
        },
      },
      '/auth/esqueci-senha': {
        post: {
          tags: ['Autenticação e conta'],
          summary: 'Enviar e-mail de redefinição de senha',
          description: 'Responde 204 mesmo se o e-mail não tiver conta. 3 por minuto por IP.',
          ...publica,
          requestBody: corpo(esqueciSenhaSchema, { email: 'maria.souza@email.com' }),
          responses: {
            204: resposta('Pedido recebido'),
            400: ref('Validacao'),
            429: ref('LimiteExcedido'),
          },
        },
      },
      '/me': {
        get: {
          tags: ['Autenticação e conta'],
          summary: 'Perfil do usuário logado',
          ...autenticada,
          responses: { 200: resposta('Perfil', PERFIL), 401: ref('NaoAutenticado') },
        },
        patch: {
          tags: ['Autenticação e conta'],
          summary: 'Alterar telefone e aceite de marketing',
          ...autenticada,
          requestBody: corpo(atualizarMeSchema, { aceita_marketing: false }),
          responses: {
            200: resposta('Perfil atualizado', { ...PERFIL, aceita_marketing: false }),
            400: ref('Validacao'),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/dashboard': {
        get: {
          tags: ['Início'],
          summary: 'Dados da tela Início',
          ...autenticada,
          responses: {
            200: resposta('Resumo do segurado', {
              nome: 'Maria Souza',
              iniciais: 'MS',
              tempo_de_casa: { anos: 3, meses: 4 },
              aniversario_hoje: false,
              nao_lidas: 1,
              apolices_ativas: [APOLICE],
            }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/apolices': {
        get: {
          tags: ['Apólices'],
          summary: 'Apólices do usuário',
          ...autenticada,
          parameters: paginacao,
          responses: {
            200: resposta('Lista paginada', { itens: [APOLICE], pagina: 1, limite: 20, total: 3 }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/apolices/{id}': {
        get: {
          tags: ['Apólices'],
          summary: 'Detalhe da apólice',
          ...autenticada,
          parameters: [parametroId('apólice')],
          responses: {
            200: resposta('Apólice', { ...APOLICE, premio: 2400, coberturas: [] }),
            401: ref('NaoAutenticado'),
            404: ref('NaoEncontrado'),
          },
        },
      },
      '/apolices/{id}/pdf': {
        get: {
          tags: ['Apólices'],
          summary: 'Link do PDF (válido por 60 segundos)',
          ...autenticada,
          parameters: [parametroId('apólice')],
          responses: {
            200: resposta('URL assinada do Storage', {
              url: 'http://127.0.0.1:54321/storage/v1/object/sign/apolices/exemplos/apolice_auto.pdf?token=…',
              expira_em: '2026-10-29T21:52:50.026Z',
            }),
            401: ref('NaoAutenticado'),
            404: ref('NaoEncontrado'),
          },
        },
      },
      '/contatos': {
        get: {
          tags: ['Assistência'],
          summary: 'Contatos de assistência 24h ou de sinistro',
          description: 'Filtrados pelos produtos das apólices ativas do usuário.',
          ...autenticada,
          parameters: [
            {
              name: 'tipo',
              in: 'query',
              required: true,
              schema: { type: 'string', enum: ['ASSISTENCIA_24H', 'SINISTRO'] },
            },
          ],
          responses: {
            200: resposta('Contatos', {
              itens: [
                {
                  id: 'b840ab68-be4a-48fd-aded-986f133edf33',
                  tipo: 'ASSISTENCIA_24H',
                  produto: 'AUTO',
                  rotulo: 'Assistência 24h - Auto',
                  telefone: '08007001000',
                  whatsapp: '5581900000000',
                },
              ],
            }),
            400: ref('Validacao'),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/notificacoes': {
        get: {
          tags: ['Notificações'],
          summary: 'Notificações, mais recentes primeiro',
          ...autenticada,
          parameters: [
            ...paginacao,
            { name: 'nao_lidas', in: 'query', schema: { type: 'boolean' } },
          ],
          responses: {
            200: resposta('Lista paginada', { itens: [NOTIFICACAO], pagina: 1, limite: 20, total: 1 }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/notificacoes/{id}/lida': {
        patch: {
          tags: ['Notificações'],
          summary: 'Marcar como lida',
          ...autenticada,
          parameters: [parametroId('notificação')],
          responses: {
            200: resposta('Notificação atualizada', {
              ...NOTIFICACAO,
              lida_em: '2026-10-29T21:51:50.778+00:00',
            }),
            401: ref('NaoAutenticado'),
            404: ref('NaoEncontrado'),
          },
        },
      },
    },
  };
}
