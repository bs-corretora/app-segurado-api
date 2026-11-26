-- Carga de dados de desenvolvimento (seção 5.5 da especificação).
-- Roda só no `supabase db reset`. Credenciais de teste no README: senha `Senha@123` para todos.

-- Usuários do Supabase Auth. As colunas de token vão como '' (NULL quebra o login do GoTrue)
-- e cada usuário ganha a identidade `email`, sem a qual o login por senha falha.

WITH usuarios (id, email) AS (
    VALUES
    ('11111111-1111-1111-1111-111111111111'::UUID, 'admin@bsseguros.com.br'),
    ('22222222-2222-2222-2222-222222222222'::UUID, 'maria.souza@email.com'),
    ('33333333-3333-3333-3333-333333333333'::UUID, 'joao.silva@email.com'),
    ('44444444-4444-4444-4444-444444444444'::UUID, 'ana.oliveira@email.com'),
    ('55555555-5555-5555-5555-555555555555'::UUID, 'carlos.pereira@email.com'),
    ('66666666-6666-6666-6666-666666666666'::UUID, 'fernanda.costa@email.com')
)
INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
    id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', email,
    extensions.crypt('Senha@123', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now(),
    '', '', '', ''
FROM usuarios;

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT id::TEXT, id, jsonb_build_object('sub', id::TEXT, 'email', email, 'email_verified', true), 'email', now(), now(), now()
FROM auth.users
WHERE id IN (
    '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666'
);

-- Perfis correspondentes (CPFs fictícios com dígito verificador válido).
-- João faz aniversário na data em que o banco é recriado (fuso de São Paulo, o mesmo do job), para a demonstração do RF-08.
-- cliente_desde segue a regra 5.4: menor inicio_vigencia entre as apólices vinculadas.

INSERT INTO public.perfil (id, cpf, nome, telefone, data_nascimento, cliente_desde, papel, codigo_indicacao, aceita_marketing, termos_aceitos_em) VALUES
('11111111-1111-1111-1111-111111111111', '11144477735', 'Administrador BS', '81999990000', '1985-05-15', '2023-01-01', 'ADMIN', 'ADM001', false, now()),
('22222222-2222-2222-2222-222222222222', '52948220084', 'Maria Souza', '81988881111', '1992-06-20', '2023-06-01', 'SEGURADO', 'MARIA123', true, now()),
('33333333-3333-3333-3333-333333333333', '22334455628', 'João Silva', '81988882222', ((now() AT TIME ZONE 'America/Sao_Paulo')::DATE - INTERVAL '38 years')::DATE, '2025-10-15', 'SEGURADO', 'JOAO456', true, now()),
('44444444-4444-4444-4444-444444444444', '33445566739', 'Ana Oliveira', '81988883333', '1995-12-10', '2026-02-01', 'SEGURADO', 'ANA789', false, now()),
('55555555-5555-5555-5555-555555555555', '44556677840', 'Carlos Pereira', '81988884444', '1980-04-05', '2025-11-20', 'SEGURADO', 'CARLOS101', true, now()),
('66666666-6666-6666-6666-666666666666', '55667788950', 'Fernanda Costa', '81988885555', '1998-08-25', '2026-10-01', 'SEGURADO', 'FERN202', true, now());

-- Apólices: 1 a 3 por segurado, mais uma de CPF sem conta para testar o vínculo no cadastro

INSERT INTO public.apolice (id, cpf_titular, perfil_id, numero, produto, status, inicio_vigencia, fim_vigencia, premio, pdf_caminho) VALUES
('6f1c1111-1111-1111-1111-111111111111', '52948220084', '22222222-2222-2222-2222-222222222222', 'AU-2026-000184', 'AUTO', 'ATIVA', '2026-10-01', '2027-10-01', 2400.00, 'exemplos/apolice_auto.pdf'),
('6f1c2222-2222-2222-2222-222222222222', '52948220084', '22222222-2222-2222-2222-222222222222', 'RE-2026-000052', 'RESIDENCIAL', 'ATIVA', '2026-05-01', '2027-05-01', 1200.00, 'exemplos/apolice_res.pdf'),
('6f1c2223-2222-2222-2222-222222222222', '52948220084', '22222222-2222-2222-2222-222222222222', 'VI-2023-000031', 'VIDA', 'VENCIDA', '2023-06-01', '2024-06-01', 640.00, 'exemplos/apolice_vida.pdf'),
('6f1c3333-3333-3333-3333-333333333333', '22334455628', '33333333-3333-3333-3333-333333333333', 'VI-2025-000012', 'VIDA', 'VENCIDA', '2025-10-15', '2026-10-15', 850.00, 'exemplos/apolice_vida.pdf'),
('6f1c3334-3333-3333-3333-333333333333', '22334455628', '33333333-3333-3333-3333-333333333333', 'RE-2026-000090', 'RESIDENCIAL', 'ATIVA', '2026-03-15', '2027-03-15', 980.00, 'exemplos/apolice_res.pdf'),
('6f1c4444-4444-4444-4444-444444444444', '33445566739', '44444444-4444-4444-4444-444444444444', 'EM-2026-000005', 'EMPRESARIAL', 'ATIVA', '2026-02-01', '2027-02-01', 5000.00, 'exemplos/apolice_emp.pdf'),
('6f1c6666-6666-6666-6666-666666666666', '44556677840', '55555555-5555-5555-5555-555555555555', 'AU-2025-000310', 'AUTO', 'ATIVA', '2025-11-20', '2026-11-20', 2250.00, 'exemplos/apolice_auto.pdf'),
('6f1c7777-7777-7777-7777-777777777777', '55667788950', '66666666-6666-6666-6666-666666666666', 'RE-2026-000140', 'RESIDENCIAL', 'ATIVA', '2026-10-01', '2027-10-01', 1100.00, 'exemplos/apolice_res.pdf'),
('6f1c5555-5555-5555-5555-555555555555', '99887766593', NULL, 'AU-2026-000999', 'AUTO', 'ATIVA', '2026-01-01', '2027-01-01', 2100.00, 'exemplos/apolice_auto.pdf');

-- Contatos de assistência para os produtos de seguro

INSERT INTO public.contato_assistencia (tipo, produto, rotulo, telefone, whatsapp) VALUES
('ASSISTENCIA_24H', 'AUTO', 'Assistência 24h - Auto', '08007001000', '5581900000000'),
('ASSISTENCIA_24H', 'RESIDENCIAL', 'Assistência 24h - Residencial', '08007002000', '5581900000001'),
('ASSISTENCIA_24H', 'VIDA', 'Assistência 24h - Vida', '08007003000', '5581900000002'),
('ASSISTENCIA_24H', 'EMPRESARIAL', 'Assistência 24h - Empresarial', '08007004000', '5581900000003'),
('SINISTRO', NULL, 'Central de Atendimento de Sinistros', '08008009000', '5581911112222');

-- Sinistros com histórico

INSERT INTO public.sinistro (id, perfil_id, apolice_id, protocolo, tipo, data_ocorrencia, local, descricao, status, criado_em) VALUES
('a7d21111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '6f1c1111-1111-1111-1111-111111111111', 'SIN-2026-000123', 'COLISAO', '2026-10-03 14:20:00-03', 'Av. Boa Viagem, Recife-PE', 'Colisão traseira no semáforo.', 'EM_ANALISE', '2026-10-03 14:25:00-03'),
('a7d22222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', '6f1c6666-6666-6666-6666-666666666666', 'SIN-2026-000124', 'ROUBO', '2026-09-12 22:10:00-03', 'Rua da Aurora, Recife-PE', 'Veículo levado enquanto estacionado.', 'CONCLUIDO', '2026-09-13 08:05:00-03');

INSERT INTO public.sinistro_evento (sinistro_id, status, comentario, autor_id, criado_em) VALUES
('a7d21111-1111-1111-1111-111111111111', 'ABERTO', 'Sinistro aberto pelo aplicativo.', NULL, '2026-10-03 14:25:00-03'),
('a7d21111-1111-1111-1111-111111111111', 'EM_ANALISE', 'Documentação recebida e encaminhada para perícia.', '11111111-1111-1111-1111-111111111111', '2026-10-04 09:00:00-03'),
('a7d22222-2222-2222-2222-222222222222', 'ABERTO', 'Sinistro aberto pelo aplicativo.', NULL, '2026-09-13 08:05:00-03'),
('a7d22222-2222-2222-2222-222222222222', 'EM_ANALISE', 'Boletim de ocorrência recebido.', '11111111-1111-1111-1111-111111111111', '2026-09-14 10:30:00-03'),
('a7d22222-2222-2222-2222-222222222222', 'CONCLUIDO', 'Indenização aprovada. O pagamento cai em até 5 dias úteis.', '11111111-1111-1111-1111-111111111111', '2026-09-25 16:00:00-03');

-- Os protocolos acima foram fixados à mão; a sequência continua depois deles
SELECT setval('public.sinistro_protocolo_seq', 124);

-- Cotações: uma respondida e uma renovação aguardando resposta

INSERT INTO public.cotacao (id, perfil_id, produto, motivo, dados, status, resposta, valor_estimado, criado_em, respondida_em) VALUES
('c31e1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'RESIDENCIAL', 'NOVO', '{"tipo_imovel": "casa", "valor_edificacao": 350000}', 'RESPONDIDA', 'Plano básico a partir de R$ 39,90/mês.', 478.80, '2026-10-03 10:00:00-03', '2026-10-04 16:30:00-03'),
('c31e2222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'AUTO', 'RENOVACAO', '{"apolice_numero": "AU-2025-000310", "placa": "PEX1A23"}', 'RECEBIDA', NULL, NULL, '2026-10-20 19:15:00-03', NULL);

-- Indicações de novos clientes

INSERT INTO public.indicacao (indicador_id, nome, telefone, email, status, criado_em) VALUES
('22222222-2222-2222-2222-222222222222', 'Lucas Mendes', '81999998888', 'lucas.mendes@email.com', 'NOVA', '2026-10-05 11:00:00-03'),
('33333333-3333-3333-3333-333333333333', 'Paula Ramos', '81999997777', NULL, 'CONTATADA', '2026-09-28 15:40:00-03');

-- Notificações de teste

INSERT INTO public.notificacao (id, perfil_id, tipo, titulo, mensagem, destino_tipo, destino_id, lida_em, criado_em) VALUES
('9e441111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'SISTEMA', 'Seu sinistro mudou de status', 'SIN-2026-000123 está em análise.', 'SINISTRO', 'a7d21111-1111-1111-1111-111111111111', NULL, '2026-10-04 09:00:00-03'),
('9e442222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 'SISTEMA', 'Sua cotação foi respondida', 'Veja a proposta para o seguro residencial.', 'COTACAO', 'c31e1111-1111-1111-1111-111111111111', '2026-10-04 18:00:00-03', '2026-10-04 16:30:00-03'),
('9e443333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'SISTEMA', 'Seu sinistro foi concluído', 'SIN-2026-000124 foi concluído.', 'SINISTRO', 'a7d22222-2222-2222-2222-222222222222', NULL, '2026-09-25 16:00:00-03'),
('9e444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'MARKETING', 'Proteja sua casa também', 'Clientes empresariais têm condição especial no seguro residencial.', NULL, NULL, NULL, '2026-10-10 12:00:00-03');

-- Notificações do seed são antigas: não entram na fila do e-mail (#72), como as de produção na migration.
UPDATE public.notificacao SET email_enviado_em = criado_em;

-- Base de conhecimento RAG (Sub-issue #54)
-- Gerado a partir de supabase/conhecimento/*.md; para o banco da nuvem use `npm run conhecimento`.

INSERT INTO public.conhecimento (id, titulo, conteudo, categoria) VALUES
('11111111-1111-1111-1111-111111111111', 'Como abrir um sinistro pelo aplicativo', 'Toque na aba "Sinistro" e depois em "Abrir sinistro". Escolha a apólice (só aparecem apólices ativas), o tipo de sinistro (Colisão, Roubo ou furto, Incêndio, Dano elétrico ou Outro), a data e hora da ocorrência (não pode ser no futuro), o local e a descrição. Toque em "Abrir sinistro". O app mostra seu protocolo; toque em "Acompanhar sinistro" para ver o histórico. Cada mudança aparece nas notificações. O app não tem envio de fotos ou documentos. Sem apólice ativa, use os contatos de sinistro mostrados na aba "Sinistro".', 'SINISTRO'),
('22222222-2222-2222-2222-222222222222', 'Como consultar minhas apólices ativas', 'Na aba "Início" você vê "Minhas apólices ativas". Para ver todas, toque em "Ver todas as apólices". Cada apólice mostra o status: Ativa, Vencida ou Cancelada. Toque numa apólice para ver o detalhe: número, início da vigência, fim da vigência e prêmio. Para abrir o documento, toque em "Ver apólice em PDF"; ele abre em outra aba. Se o PDF ainda não estiver disponível, o app avisa.', 'APOLICE'),
('33333333-3333-3333-3333-333333333333', 'Como solicitar uma cotação de seguro', 'Toque na aba "Cotação" e depois em "Nova cotação". Escolha o seguro: Auto, Residencial, Vida ou Empresarial. Na tela "Solicitar cotação", preencha: tipo de pedido (Novo seguro ou Renovação), tipo de cobertura, telefone para contato (com DDD) e detalhes do pedido. Toque em "Enviar pedido". Em "Meus pedidos" você acompanha o status (Recebida, Em análise ou Respondida). Quando a corretora responder, você é avisado nas notificações e vê o valor estimado e a resposta no detalhe do pedido.', 'COTACAO'),
('44444444-4444-4444-4444-444444444444', 'Como indicar um amigo', 'Toque em "Indicar" no card "Indique amigos" da aba "Início", ou vá em "Configurações" > "Indique amigos". A tela mostra seu link de indicação e seu código. Toque em "Copiar" ou "Compartilhar" para enviar o link a quem você quiser. Quem fizer cotação pelo seu link aparece em "Minhas indicações", com o status (Nova, Contatada ou Convertida). O app não informa nenhum benefício ou prêmio por indicação; para saber, fale com a corretora.', 'APP_USO'),
('55555555-5555-5555-5555-555555555555', 'Como ver as notificações', 'O sino fica no canto superior direito do cabeçalho; um número vermelho indica quantas notificações não foram lidas. Toque no sino para abrir "Notificações". Os avisos de sinistro, cotação e renovação chegam ali. Toque numa notificação para marcá-la como lida e abrir a tela relacionada (sinistro, cotação ou apólice). Não há botão para marcar todas como lidas.', 'APP_USO'),
('66666666-6666-6666-6666-666666666666', 'Como criar sua conta e entrar no app', 'Para criar a conta: na tela de entrada, toque em "Criar conta". Preencha nome completo, CPF, e-mail, celular, data de nascimento (é preciso ter 18 anos ou mais) e senha (mínimo 8 caracteres). Se já tiver apólice, pode informar o número dela (opcional); assim as apólices do seu CPF já aparecem no app. Marque "Li e aceito os termos de uso e a política de privacidade" e toque em "Criar conta". Em seguida aparece a tela "Tudo pronto".

Para entrar: informe seu e-mail e sua senha e toque em "Entrar". O login é pelo e-mail, não pelo CPF.', 'CONTA'),
('77777777-7777-7777-7777-777777777777', 'Como trocar ou recuperar sua senha', 'Para trocar a senha sabendo a atual: aba "Configurações" > "Dados cadastrais e senha". Na seção "Trocar senha", informe a senha atual e a nova (mínimo 8 caracteres; a nova precisa ser diferente da atual) e toque em "Trocar senha".

Se esqueceu a senha: na tela de entrada, toque em "Esqueci minha senha", informe seu e-mail e toque para enviar. Se o e-mail estiver cadastrado, você recebe um link para criar a nova senha. Depois, volte ao app e entre.', 'CONTA'),
('88888888-8888-8888-8888-888888888888', 'Como instalar o app na tela inicial', 'O app pode ser instalado na tela inicial do celular.

**Android (Chrome):** quando o navegador permite a instalação, aparece em "Configurações" o item "Instalar o app na tela inicial". Toque nele e confirme.

**iPhone ou iPad (Safari):** em "Configurações", toque em "Instalar o app na tela inicial" e siga o passo a passo: 1) toque no botão Compartilhar (quadrado com seta para cima); 2) role e toque em "Adicionar à Tela de Início"; 3) toque em "Adicionar".

Se o item não aparecer em "Configurações", o app já está instalado ou o navegador não oferece a instalação.', 'APP_USO');
