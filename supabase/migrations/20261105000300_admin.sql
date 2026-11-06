-- Etapa 5: operações do painel administrativo que precisam de transação ou de auth.users.
--
-- Todas recebem dados de qualquer perfil: só a service_role (a API, depois de conferir o papel
-- ADMIN) pode executá-las, nunca anon nem authenticated. Os erros de regra saem por RAISE com
-- mensagem fixa, que a API traduz em 404/409.

-- -------------------------------------------------------------------------------------------
-- Busca de segurados por nome, CPF ou e-mail (GET /admin/segurados)
-- -------------------------------------------------------------------------------------------
-- O e-mail mora em auth.users, que a API não lê pelo PostgREST; por isso a busca é uma função.
-- SECURITY DEFINER para ler auth.users; devolve só id, nome, cpf, telefone, e-mail e datas.
-- strpos em vez de ILIKE: "%" e "_" digitados na busca não viram curinga.
CREATE OR REPLACE FUNCTION public.admin_buscar_segurados(
    p_busca TEXT,
    p_limite INTEGER,
    p_offset INTEGER
)
RETURNS TABLE (
    id UUID,
    nome VARCHAR,
    cpf VARCHAR,
    telefone VARCHAR,
    email VARCHAR,
    cliente_desde DATE,
    aceita_marketing BOOLEAN,
    total BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id, p.nome, p.cpf, p.telefone, u.email::VARCHAR, p.cliente_desde, p.aceita_marketing,
           count(*) OVER () AS total
    FROM public.perfil p
    JOIN auth.users u ON u.id = p.id
    WHERE p.papel = 'SEGURADO'
      AND (
          p_busca IS NULL
          OR strpos(lower(p.nome), lower(p_busca)) > 0
          OR (regexp_replace(p_busca, '[^0-9]', '', 'g') <> ''
              AND strpos(p.cpf, regexp_replace(p_busca, '[^0-9]', '', 'g')) = 1)
          OR strpos(lower(u.email), lower(p_busca)) > 0
      )
    ORDER BY p.nome
    LIMIT p_limite OFFSET p_offset;
$$;

REVOKE ALL ON FUNCTION public.admin_buscar_segurados(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_buscar_segurados(TEXT, INTEGER, INTEGER) TO service_role;

-- E-mail de um segurado (GET /admin/segurados/{id}). NULL se não existe ou não é segurado.
CREATE OR REPLACE FUNCTION public.admin_email_do_segurado(p_id UUID)
RETURNS VARCHAR
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT u.email::VARCHAR
    FROM public.perfil p
    JOIN auth.users u ON u.id = p.id
    WHERE p.id = p_id AND p.papel = 'SEGURADO';
$$;

REVOKE ALL ON FUNCTION public.admin_email_do_segurado(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_email_do_segurado(UUID) TO service_role;

-- -------------------------------------------------------------------------------------------
-- Mudança de status de sinistro (PATCH /admin/sinistros/{id}/status, seção 5.4)
-- -------------------------------------------------------------------------------------------
-- Só anda para a frente: ABERTO → EM_ANALISE → CONCLUIDO (pode pular de ABERTO para CONCLUIDO).
-- Na mesma transação: atualiza o sinistro, grava o evento com o autor e notifica o segurado.
CREATE OR REPLACE FUNCTION public.admin_alterar_status_sinistro(
    p_sinistro_id UUID,
    p_status TEXT,
    p_comentario TEXT,
    p_autor_id UUID
)
RETURNS public.sinistro
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ordem CONSTANT TEXT[] := ARRAY['ABERTO', 'EM_ANALISE', 'CONCLUIDO'];
    v_sinistro public.sinistro;
BEGIN
    SELECT * INTO v_sinistro FROM public.sinistro WHERE id = p_sinistro_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'sinistro_nao_encontrado' USING ERRCODE = 'P0001';
    END IF;
    IF v_sinistro.status = p_status THEN
        RAISE EXCEPTION 'status_igual' USING ERRCODE = 'P0001';
    END IF;
    IF array_position(v_ordem, p_status) < array_position(v_ordem, v_sinistro.status::TEXT) THEN
        RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.sinistro SET status = p_status WHERE id = p_sinistro_id
    RETURNING * INTO v_sinistro;

    INSERT INTO public.sinistro_evento (sinistro_id, status, comentario, autor_id)
    VALUES (p_sinistro_id, p_status, p_comentario, p_autor_id);

    INSERT INTO public.notificacao (perfil_id, tipo, titulo, mensagem, destino_tipo, destino_id)
    VALUES (
        v_sinistro.perfil_id,
        'SISTEMA',
        'Seu sinistro mudou de status',
        v_sinistro.protocolo || CASE p_status
            WHEN 'EM_ANALISE' THEN ' está em análise.'
            WHEN 'CONCLUIDO' THEN ' foi concluído.'
            ELSE ' foi atualizado.'
        END,
        'SINISTRO',
        p_sinistro_id
    );

    RETURN v_sinistro;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_alterar_status_sinistro(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_alterar_status_sinistro(UUID, TEXT, TEXT, UUID) TO service_role;

-- -------------------------------------------------------------------------------------------
-- Resposta de cotação (PATCH /admin/cotacoes/{id}/resposta)
-- -------------------------------------------------------------------------------------------
-- Cotação já respondida não é respondida de novo (409). Grava a resposta e notifica o segurado.
CREATE OR REPLACE FUNCTION public.admin_responder_cotacao(
    p_cotacao_id UUID,
    p_resposta TEXT,
    p_valor_estimado NUMERIC
)
RETURNS public.cotacao
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_cotacao public.cotacao;
BEGIN
    SELECT * INTO v_cotacao FROM public.cotacao WHERE id = p_cotacao_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'cotacao_nao_encontrada' USING ERRCODE = 'P0001';
    END IF;
    IF v_cotacao.status = 'RESPONDIDA' THEN
        RAISE EXCEPTION 'cotacao_ja_respondida' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.cotacao
    SET status = 'RESPONDIDA', resposta = p_resposta, valor_estimado = p_valor_estimado,
        respondida_em = now()
    WHERE id = p_cotacao_id
    RETURNING * INTO v_cotacao;

    INSERT INTO public.notificacao (perfil_id, tipo, titulo, mensagem, destino_tipo, destino_id)
    VALUES (
        v_cotacao.perfil_id,
        'SISTEMA',
        'Sua cotação foi respondida',
        'Veja a resposta da sua cotação de seguro.',
        'COTACAO',
        p_cotacao_id
    );

    RETURN v_cotacao;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_responder_cotacao(UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_responder_cotacao(UUID, TEXT, NUMERIC) TO service_role;

-- -------------------------------------------------------------------------------------------
-- Status de indicação (PATCH /admin/indicacoes/{id}/status)
-- -------------------------------------------------------------------------------------------
-- Só anda para a frente: NOVA → CONTATADA → CONVERTIDA (pode pular de NOVA para CONVERTIDA).
CREATE OR REPLACE FUNCTION public.admin_alterar_status_indicacao(p_indicacao_id UUID, p_status TEXT)
RETURNS public.indicacao
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_ordem CONSTANT TEXT[] := ARRAY['NOVA', 'CONTATADA', 'CONVERTIDA'];
    v_indicacao public.indicacao;
BEGIN
    SELECT * INTO v_indicacao FROM public.indicacao WHERE id = p_indicacao_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'indicacao_nao_encontrada' USING ERRCODE = 'P0001';
    END IF;
    IF v_indicacao.status = p_status THEN
        RAISE EXCEPTION 'status_igual' USING ERRCODE = 'P0001';
    END IF;
    IF array_position(v_ordem, p_status) < array_position(v_ordem, v_indicacao.status::TEXT) THEN
        RAISE EXCEPTION 'transicao_invalida' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.indicacao SET status = p_status WHERE id = p_indicacao_id
    RETURNING * INTO v_indicacao;
    RETURN v_indicacao;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_alterar_status_indicacao(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_alterar_status_indicacao(UUID, TEXT) TO service_role;
