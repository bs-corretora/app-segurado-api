-- Seed inicial para a base de conhecimento RAG (Sub-issue #54)
-- Trechos sobre o funcionamento do aplicativo do segurado

INSERT INTO public.conhecimento (titulo, conteudo, categoria, tags) VALUES
-- APP_USO - Como usar o app
('Como abrir um sinistro pelo aplicativo',
 'Para abrir um sinistro: 1) Acesse a tela "Sinistros" no menu inferior. 2) Toque no botão "+" ou "Novo Sinistro". 3) Selecione a apólice relacionada. 4) Preencha: tipo de sinistro (colisão, roubo, incêndio, etc.), data e hora da ocorrência, local (endereço ou referência), descrição detalhada do ocorrido. 5) Anexe fotos dos danos e documentos (boletim de ocorrência, se houver). 6) Revise e confirme. Você receberá o protocolo na hora e poderá acompanhar o status na mesma tela.',
 'APP_USO', ARRAY['sinistro', 'abrir', 'passo a passo', 'protocolo']),

('Como consultar minhas apólices ativas',
 'Na tela inicial ("Início") você vê um resumo das apólices ativas. Para ver todas: vá em "Apólices" no menu inferior. Lá estão listadas todas as suas apólices com status (ATIVA, VENCIDA, CANCELADA). Toque numa apólice para ver detalhes: número, produto, vigência (início e fim), prêmio, coberturas e botão para baixar o PDF.',
 'APP_USO', ARRAY['apolice', 'consultar', 'ativas', 'pdf', 'vigencia']),

('Como solicitar uma cotação de seguro',
 'No menu inferior, toque em "Cotações" e depois em "Nova Cotação". Escolha o produto (Auto, Residencial, Vida, Empresarial) e o motivo (Novo ou Renovação). Preencha os dados solicitados conforme o produto: para Auto informe placa, modelo, ano; para Residencial informe tipo de imóvel e valor da edificação; para Vida informe idade e valor desejado. Envie e aguarde a resposta da corretora. Você será notificado quando houver resposta.',
 'APP_USO', ARRAY['cotacao', 'solicitar', 'novo', 'renovacao', 'produtos']),

('Como indicar um amigo e ganhar benefícios',
 'Acesse "Indicações" no menu inferior. Toque em "Indicar Amigo". Preencha nome, telefone e e-mail (opcional) do indicado. Seu código de indicação único é gerado automaticamente. Quando o indicado contratar um seguro usando seu código, você recebe o benefício conforme a campanha vigente. Acompanhe o status das suas indicações na mesma tela.',
 'APP_USO', ARRAY['indicacao', 'amigo', 'beneficio', 'codigo', 'campanha']),

('Como ver e gerenciar notificações',
 'O ícone de sino no canto superior direito mostra notificações não lidas. Toque para ver todas: de sistema (status de sinistro, cotação respondida), marketing e alertas. Toque numa notificação para ir direto à tela relacionada (ex: abrir o sinistro que mudou de status). Deslize para marcar como lida ou use "Marcar todas como lidas".',
 'APP_USO', ARRAY['notificacao', 'sino', 'ler', 'marcar lida', 'sistema']),

('Como baixar o PDF da apólice',
 'Na tela de detalhes da apólice (Apólices > toque na apólice), há o botão "Baixar PDF". O link é válido por 60 segundos por segurança. Se o PDF não estiver disponível, aparecerá "PDF indisponível" — entre em contato com a corretora.',
 'APP_USO', ARRAY['apolice', 'pdf', 'baixar', 'download', '60 segundos']),

-- SINISTRO - Fluxo de sinistro
('Tipos de sinistro aceitos no app',
 'Os tipos disponíveis ao abrir um sinistro: COLISAO (colisão/batedor), ROUBO (roubo/furto do veículo), INCENDIO (incêndio), ALAGAMENTO (alagamento/enchente), QUEDA_ARVORE (queda de árvore), GRANIZO (granizo), TERCEIROS (danos a terceiros), OUTROS (outros eventos cobertos). Escolha o que melhor descreve o ocorrido.',
 'SINISTRO', ARRAY['tipos', 'colisao', 'roubo', 'incendio', 'alagamento', 'granizo']),

('Documentos necessários para sinistro de auto',
 'Para sinistro de automóvel, tenha em mãos: 1) Boletim de ocorrência (obrigatório para roubo/furto e colisão com terceiros). 2) Fotos dos danos (múltiplos ângulos). 3) CNH do condutor no momento. 4) Documento do veículo (CRLV). 5) Orçamento de oficina (se já tiver). Para roubo: certidão de roubo do DETRAN. Anexe pelo app na abertura ou depois na tela do sinistro.',
 'SINISTRO', ARRAY['documentos', 'auto', 'boletim ocorrencia', 'fotos', 'cnh', 'crlv']),

('Acompanhar status do sinistro',
 'Após abrir, o sinistro passa por: ABERTO (acabou de criar) → EM_ANALISE (documentação recebida, em análise) → CONCLUIDO (indenização aprovada/recusada, pagamento em até 5 dias úteis). Você vê o status na tela "Sinistros" e recebe notificação a cada mudança. Toque no sinistro para ver o histórico completo com comentários da equipe.',
 'SINISTRO', ARRAY['status', 'aberto', 'em analise', 'concluido', 'historico', 'protocolo']),

('Prazo para abertura de sinistro',
 'O sinistro deve ser comunicado o mais rápido possível. Para roubo/furto: imediatamente, com boletim de ocorrência. Para colisão: até 7 dias corridos. Para danos da natureza (granizo, alagamento): até 30 dias. Atraso pode prejudicar a análise. O app permite abrir a qualquer momento, mas a cobertura depende das condições da apólice.',
 'SINISTRO', ARRAY['prazo', 'comunicar', 'roubo', 'colisao', 'natureza', 'cobertura']),

-- COTACAO - Fluxo de cotação
('Produtos disponíveis para cotação',
 'O app oferece cotação para: AUTO (carro, moto, caminhão), RESIDENCIAL (casa, apartamento), VIDA (individual, familiar), EMPRESARIAL (pequeno/médio porte). Cada produto tem campos específicos. Para renovação, informe o número da apólice atual.',
 'COTACAO', ARRAY['produtos', 'auto', 'residencial', 'vida', 'empresarial', 'renovacao']),

('O que acontece após enviar a cotação',
 'Após enviar: 1) Status "RECEBIDA" — a corretora recebeu. 2) A equipe analisa e monta a proposta (prazo habitual: 1 a 2 dias úteis). 3) Status vira "RESPONDIDA" — você recebe notificação. 4) Abra a cotação para ver a resposta com valor estimado e condições. 5) Se quiser contratar, responda pelo app ou ligue para a central.',
 'COTACAO', ARRAY['fluxo', 'recebida', 'respondida', 'proposta', 'valor estimado', 'contratar']),

('Validade da cotação respondida',
 'A proposta de cotação tem validade de 15 dias corridos a partir da data da resposta. Após isso, os valores e condições podem mudar. Para renovar a cotação, abra uma nova solicitando "RENOVACAO" e informe a apólice anterior.',
 'COTACAO', ARRAY['validade', '15 dias', 'proposta', 'renovacao', 'valores']),

-- APOLICE - Gestão de apólices
('Vigência e renovação da apólice',
 'Toda apólice tem início e fim de vigência. Perto do vencimento (30 dias antes), você recebe notificação para renovar. Acesse "Cotações" > "Nova Cotação" > motivo "RENOVACAO" e informe o número da apólice. A apólice vencida fica com status "VENCIDA" e não cobre sinistros. Renove antes do fim da vigência para manter a cobertura contínua.',
 'APOLICE', ARRAY['vigencia', 'renovacao', 'vencimento', '30 dias', 'notificacao', 'cobertura']),

('Status da apólice: ATIVA, VENCIDA, CANCELADA',
 'ATIVA: vigente, cobre sinistros normalmente. VENCIDA: fim da vigência passou, sem cobertura até renovar. CANCELADA: encerrada antes do fim (por solicitação ou inadimplência), sem cobertura. Só apólices ATIVAS aparecem nos contatos de assistência 24h e na abertura de sinistro.',
 'APOLICE', ARRAY['status', 'ativa', 'vencida', 'cancelada', 'cobertura', 'assistencia']),

('Como atualizar dados da apólice (endereço, condutor, etc.)',
 'O app não permite alterar dados da apólice diretamente. Para mudanças: endereço de risco, condutor principal, veículo (troca), cobertura — entre em contato com a corretora pelo telefone da assistência 24h ou abra uma cotação de "RENOVACAO" informando as alterações desejadas.',
 'APOLICE', ARRAY['atualizar', 'endereco', 'condutor', 'veiculo', 'cobertura', 'corretora']),

-- GERAL - Dúvidas gerais
('Contatos de assistência 24h',
 'Na tela "Contatos" (menu inferior) você encontra: Assistência 24h por produto (Auto, Residencial, Vida, Empresarial) com telefone e WhatsApp. Central de Sinistros (0800) para abrir sinistro por telefone. Os contatos filtram pelo produto das suas apólices ATIVAS. Se não tiver apólice ativa, aparecem apenas os contatos gerais.',
 'GERAL', ARRAY['assistencia 24h', 'telefone', 'whatsapp', 'sinistros', 'contatos', 'produto']),

('Como alterar minha senha',
 'Vá em "Perfil" (ícone de usuário no canto superior) > "Alterar Senha". Informe a senha atual e a nova senha (mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número, 1 especial). Se esqueceu a senha, use "Esqueci a senha" na tela de login para receber link por e-mail.',
 'GERAL', ARRAY['senha', 'alterar', 'esqueci', 'perfil', 'redefinir', 'email']),

('Como atualizar meus dados cadastrais',
 'Em "Perfil" > "Meus Dados" você vê: nome, CPF, telefone, data de nascimento, e-mail. Para alterar telefone ou e-mail: toque no campo, edite e salve. CPF e nome não podem ser alterados pelo app (fale com a corretora). Data de nascimento: se estiver errada, contate o suporte.',
 'GERAL', ARRAY['perfil', 'dados cadastrais', 'telefone', 'email', 'cpf', 'nome', 'alterar']),

('O que é o código de indicação',
 'Seu código único (ex: MARIA123) identifica você no programa de indicações. Compartilhe com amigos. Quando alguém contrata usando seu código, você ganha o benefício da campanha ativa (desconto, cashback, prêmio). Veja suas indicações e status em "Indicações".',
 'GERAL', ARRAY['codigo indicacao', 'programa', 'beneficio', 'campanha', 'compartilhar']),

('Suporte e ouvidoria',
 'Para dúvidas não respondidas aqui: Central de Atendimento (0800 700 9000), WhatsApp (55 81 91111-2222), e-mail suporte@bsseguros.com.br. Ouvidoria: 0800 800 9000 ou ouvidoria@bsseguros.com.br (para reclamações formais). Horário: seg-sex 8h-18h (exceto feriados).',
 'GERAL', ARRAY['suporte', 'ouvidoria', 'telefone', 'whatsapp', 'email', 'horario', 'reclamacao']);