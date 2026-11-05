import { z } from 'zod';
import { atualizarMeSchema, cadastroSchema, esqueciSenhaSchema, loginSchema } from '@/lib/schemas/conta';
import { campanhaSchema, dispositivoSchema } from '@/lib/schemas/push';
import { abrirSinistroSchema } from '@/lib/schemas/sinistro';
import { cotacaoSchema, indicadoSchema } from '@/lib/schemas/escrita';

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
      { name: 'Sinistros' },
      { name: 'Cotações' },
      { name: 'Indicações' },
      { name: 'Notificações' },
      { name: 'Push e campanhas' },
    ],
    components: {
      securitySchemes: {
        cookieSessao: {
          type: 'apiKey',
          in: 'cookie',
          name: 'access_token',
          description: 'Gravado pelo login. HttpOnly: o navegador envia sozinho.',
        },
        chaveInterna: {
          type: 'http',
          scheme: 'bearer',
          description: 'INTERNAL_API_KEY. Só o agendador do push usa.',
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
        SemPermissao: resposta('Perfil sem o papel exigido', {
          status: 403,
          erro: 'SEM_PERMISSAO',
          mensagem: 'Seu perfil não tem acesso a este recurso',
        }),
        Conflito: resposta('Operação não permitida no estado atual', {
          status: 409,
          erro: 'CONFLITO',
          mensagem: 'Só é possível abrir sinistro de apólice ativa',
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
      '/sinistros': {
        post: {
          tags: ['Sinistros'],
          summary: 'Abrir sinistro',
          description:
            'Grava o sinistro e o evento ABERTO na mesma transação e devolve o protocolo. ' +
            'Apólice de outro usuário: 404; apólice que não está ATIVA: 409.',
          ...autenticada,
          requestBody: corpo(abrirSinistroSchema, {
            apolice_id: '6f1c1111-1111-1111-1111-111111111111',
            tipo: 'COLISAO',
            data_ocorrencia: '2026-11-04T18:30:00-03:00',
            local: 'Av. Boa Viagem, Recife',
            descricao: 'Batida leve no para-choque traseiro.',
          }),
          responses: {
            201: resposta('Sinistro aberto', {
              id: 'a7d29999-9999-9999-9999-999999999999',
              protocolo: 'SIN-2026-000125',
              tipo: 'COLISAO',
              status: 'ABERTO',
              data_ocorrencia: '2026-11-04T21:30:00+00:00',
              local: 'Av. Boa Viagem, Recife',
              descricao: 'Batida leve no para-choque traseiro.',
              apolice_id: '6f1c1111-1111-1111-1111-111111111111',
              criado_em: '2026-11-05T22:00:00+00:00',
            }),
            400: ref('Validacao'),
            401: ref('NaoAutenticado'),
            404: ref('NaoEncontrado'),
            409: ref('Conflito'),
          },
        },
        get: {
          tags: ['Sinistros'],
          summary: 'Sinistros do usuário, mais recentes primeiro',
          ...autenticada,
          parameters: paginacao,
          responses: {
            200: resposta('Lista paginada', {
              itens: [
                {
                  id: 'a7d29999-9999-9999-9999-999999999999',
                  protocolo: 'SIN-2026-000125',
                  tipo: 'COLISAO',
                  status: 'ABERTO',
                  data_ocorrencia: '2026-11-04T21:30:00+00:00',
                  apolice_id: '6f1c1111-1111-1111-1111-111111111111',
                  criado_em: '2026-11-05T22:00:00+00:00',
                },
              ],
              pagina: 1,
              limite: 20,
              total: 1,
            }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/sinistros/{id}': {
        get: {
          tags: ['Sinistros'],
          summary: 'Detalhe com a linha do tempo',
          ...autenticada,
          parameters: [parametroId('sinistro')],
          responses: {
            200: resposta('Sinistro', {
              id: 'a7d29999-9999-9999-9999-999999999999',
              protocolo: 'SIN-2026-000125',
              tipo: 'COLISAO',
              status: 'ABERTO',
              eventos: [
                {
                  id: 'e1111111-1111-1111-1111-111111111111',
                  status: 'ABERTO',
                  comentario: 'Sinistro aberto pelo aplicativo.',
                  criado_em: '2026-11-05T22:00:00+00:00',
                },
              ],
            }),
            401: ref('NaoAutenticado'),
            404: ref('NaoEncontrado'),
          },
        },
      },
      '/cotacoes': {
        post: {
          tags: ['Cotações'],
          summary: 'Pedir cotação',
          description:
            'O pedido nasce RECEBIDA. `dados` são os campos do formulário do produto (até 30, valores simples).',
          ...autenticada,
          requestBody: corpo(cotacaoSchema, {
            produto: 'AUTO',
            motivo: 'NOVO',
            dados: { modelo: 'Onix 2022', placa: 'ABC1D23', uso: 'particular' },
          }),
          responses: {
            201: resposta('Cotação registrada', {
              id: 'c31e9999-9999-9999-9999-999999999999',
              produto: 'AUTO',
              motivo: 'NOVO',
              dados: { modelo: 'Onix 2022', placa: 'ABC1D23', uso: 'particular' },
              status: 'RECEBIDA',
              resposta: null,
              valor_estimado: null,
              respondida_em: null,
              criado_em: '2026-11-05T22:00:00+00:00',
            }),
            400: ref('Validacao'),
            401: ref('NaoAutenticado'),
          },
        },
        get: {
          tags: ['Cotações'],
          summary: 'Pedidos do usuário, com a resposta quando houver',
          ...autenticada,
          parameters: paginacao,
          responses: {
            200: resposta('Lista paginada', {
              itens: [
                {
                  id: 'c31e1111-1111-1111-1111-111111111111',
                  produto: 'RESIDENCIAL',
                  motivo: 'NOVO',
                  status: 'RESPONDIDA',
                  resposta: 'Plano básico a partir de R$ 39,90/mês.',
                  valor_estimado: 478.8,
                },
              ],
              pagina: 1,
              limite: 20,
              total: 1,
            }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/indicacoes/link': {
        get: {
          tags: ['Indicações'],
          summary: 'Link de indicação do usuário',
          ...autenticada,
          responses: {
            200: resposta('Link', {
              codigo: 'MARIA123',
              link: 'https://api.exemplo.com.br/indicacao/MARIA123',
            }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/indicacoes': {
        get: {
          tags: ['Indicações'],
          summary: 'Indicações feitas pelo usuário',
          description: 'Telefone e e-mail do indicado não voltam: são dados de outra pessoa.',
          ...autenticada,
          parameters: paginacao,
          responses: {
            200: resposta('Lista paginada', {
              itens: [
                {
                  id: 'd1111111-1111-1111-1111-111111111111',
                  nome: 'Lucas Mendes',
                  status: 'NOVA',
                  criado_em: '2026-10-05T14:00:00+00:00',
                },
              ],
              pagina: 1,
              limite: 20,
              total: 1,
            }),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/public/indicacoes/{codigo}': {
        post: {
          tags: ['Indicações'],
          summary: 'Indicado deixa os dados (pública)',
          description: 'Usada pela página /indicacao/{codigo}. Limite: 10 por minuto por IP.',
          ...publica,
          parameters: [
            { name: 'codigo', in: 'path', required: true, schema: { type: 'string' }, example: 'MARIA123' },
          ],
          requestBody: corpo(indicadoSchema, {
            nome: 'Rafael Lima',
            telefone: '(81) 99876-5432',
            email: 'rafael@email.com',
          }),
          responses: {
            201: resposta('Recebido', {
              mensagem: 'Recebemos seus dados. Um corretor da BS Seguros vai entrar em contato.',
            }),
            400: ref('Validacao'),
            404: ref('NaoEncontrado'),
            429: ref('LimiteExcedido'),
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
      '/dispositivos': {
        post: {
          tags: ['Push e campanhas'],
          summary: 'Registrar o token de push do aparelho',
          description: 'Token que já existia passa para o usuário logado (outro login no mesmo aparelho).',
          ...autenticada,
          requestBody: corpo(dispositivoSchema, {
            push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
            plataforma: 'ANDROID',
          }),
          responses: {
            201: resposta('Dispositivo registrado', {
              id: 'c0a81111-1111-1111-1111-111111111111',
              push_token: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]',
              plataforma: 'ANDROID',
              atualizado_em: '2026-11-05T22:00:00+00:00',
            }),
            400: ref('Validacao'),
            401: ref('NaoAutenticado'),
          },
        },
      },
      '/dispositivos/{token}': {
        delete: {
          tags: ['Push e campanhas'],
          summary: 'Remover o token no logout',
          ...autenticada,
          parameters: [
            {
              name: 'token',
              in: 'path',
              required: true,
              description: 'Token do Expo Push, codificado com encodeURIComponent',
              schema: { type: 'string' },
            },
          ],
          responses: {
            204: resposta('Removido'),
            401: ref('NaoAutenticado'),
            404: ref('NaoEncontrado'),
          },
        },
      },
      '/admin/campanhas': {
        post: {
          tags: ['Push e campanhas'],
          summary: 'Enviar campanha (ADMIN)',
          description:
            'Cria uma notificação MARKETING para cada segurado com aceita_marketing = true; com ' +
            '`produto`, só para quem tem apólice ATIVA dele. O push sai na próxima execução do agendador.',
          ...autenticada,
          requestBody: corpo(campanhaSchema, {
            titulo: 'Revisão gratuita',
            mensagem: 'Agende a revisão do seu carro sem custo até o fim do mês.',
            produto: 'AUTO',
          }),
          responses: {
            201: resposta('Campanha criada', { destinatarios: 2 }),
            400: ref('Validacao'),
            401: ref('NaoAutenticado'),
            403: ref('SemPermissao'),
          },
        },
      },
      '/internal/push/pendentes': {
        post: {
          tags: ['Push e campanhas'],
          summary: 'Enviar o push das notificações pendentes (agendador)',
          description:
            'Reserva as notificações com push_enviado_em nulo e envia pelo Expo Push. Lote que falha ' +
            'volta para a fila; token de app desinstalado é apagado.',
          security: [{ chaveInterna: [] }],
          responses: {
            200: resposta('Resumo do envio', {
              processadas: 3,
              mensagens: 2,
              sem_aparelho: 1,
              devolvidas: 0,
              tokens_removidos: 0,
            }),
            401: resposta('Chave interna ausente ou inválida', {
              status: 401,
              erro: 'NAO_AUTENTICADO',
              mensagem: 'Chave interna ausente ou inválida',
            }),
          },
        },
      },
    },
  };
}
