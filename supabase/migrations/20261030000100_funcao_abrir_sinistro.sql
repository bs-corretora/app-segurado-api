-- Etapa 4: abertura de sinistro numa única transação (seção 5.4: a abertura grava o evento ABERTO).
--
-- O cliente do Supabase (PostgREST) não abre transação entre duas chamadas. Para o sinistro e o
-- primeiro evento nunca existirem um sem o outro, os dois INSERTs ficam dentro desta função: ela
-- roda como uma transação só, e qualquer erro desfaz tudo. A API chama via `rpc('abrir_sinistro')`.

CREATE OR REPLACE FUNCTION public.abrir_sinistro(
    p_perfil_id UUID,
    p_apolice_id UUID,
    p_tipo TEXT,
    p_data_ocorrencia TIMESTAMPTZ,
    p_local TEXT,
    p_descricao TEXT
)
RETURNS public.sinistro
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_status VARCHAR(20);
    v_sinistro public.sinistro;
BEGIN
    -- A apólice precisa ser do perfil e estar ATIVA. FOR SHARE segura a linha até o fim da
    -- transação, para ela não ser cancelada entre esta checagem e o INSERT.
    SELECT status INTO v_status
    FROM public.apolice
    WHERE id = p_apolice_id AND perfil_id = p_perfil_id
    FOR SHARE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'apolice_nao_encontrada' USING ERRCODE = 'P0001';
    END IF;
    IF v_status <> 'ATIVA' THEN
        RAISE EXCEPTION 'apolice_inativa' USING ERRCODE = 'P0001';
    END IF;

    -- O protocolo SIN-AAAA-NNNNNN é gerado pelo trigger da tabela.
    INSERT INTO public.sinistro (perfil_id, apolice_id, tipo, data_ocorrencia, local, descricao)
    VALUES (p_perfil_id, p_apolice_id, p_tipo, p_data_ocorrencia, p_local, p_descricao)
    RETURNING * INTO v_sinistro;

    INSERT INTO public.sinistro_evento (sinistro_id, status, comentario, autor_id)
    VALUES (v_sinistro.id, 'ABERTO', 'Sinistro aberto pelo aplicativo.', NULL);

    RETURN v_sinistro;
END;
$$;

-- Funções do schema public ficam expostas pelo PostgREST. Esta recebe o perfil como parâmetro,
-- então só a service_role (a API) pode executá-la: nunca anon nem authenticated.
REVOKE ALL ON FUNCTION public.abrir_sinistro(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_sinistro(UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT)
    TO service_role;