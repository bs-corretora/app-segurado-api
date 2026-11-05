-- Etapa 6: job de aniversário (RF-08), campanhas (RF-06) e fila do push.
--
-- As três funções recebem dados de qualquer perfil, então só a service_role (a API) e o próprio
-- pg_cron (que roda como postgres) podem executá-las: nunca anon nem authenticated.

-- pg_cron já vem no Postgres do Supabase (local e Cloud); aqui só é ligado.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- -------------------------------------------------------------------------------------------
-- Aniversário (seção 5.4)
-- -------------------------------------------------------------------------------------------
-- Insere uma notificação ANIVERSARIO para cada segurado que faz aniversário em p_hoje.
-- Nascidos em 29/02 comemoram em 28/02 nos anos não bissextos (mesma regra de src/lib/datas.ts).
-- Rodar duas vezes no mesmo dia não duplica: quem já recebeu a de hoje fica de fora.
-- Devolve quantas notificações foram criadas.
CREATE OR REPLACE FUNCTION public.gerar_notificacoes_aniversario(
    p_hoje DATE DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_bissexto BOOLEAN := extract(day FROM make_date(extract(year FROM p_hoje)::INT, 3, 1) - 1) = 29;
    v_criadas INTEGER;
BEGIN
    INSERT INTO public.notificacao (perfil_id, tipo, titulo, mensagem)
    SELECT p.id,
           'ANIVERSARIO',
           'Feliz aniversário!',
           'A BS Seguros deseja um feliz aniversário, ' || split_part(p.nome, ' ', 1) || '!'
    FROM public.perfil p
    WHERE p.papel = 'SEGURADO'
      AND (
          (extract(month FROM p.data_nascimento) = extract(month FROM p_hoje)
           AND extract(day FROM p.data_nascimento) = extract(day FROM p_hoje))
          OR (NOT v_bissexto
              AND extract(month FROM p_hoje) = 2 AND extract(day FROM p_hoje) = 28
              AND extract(month FROM p.data_nascimento) = 2 AND extract(day FROM p.data_nascimento) = 29)
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.notificacao n
          WHERE n.perfil_id = p.id
            AND n.tipo = 'ANIVERSARIO'
            AND (n.criado_em AT TIME ZONE 'America/Sao_Paulo')::DATE = p_hoje
      );

    GET DIAGNOSTICS v_criadas = ROW_COUNT;
    RETURN v_criadas;
END;
$$;

REVOKE ALL ON FUNCTION public.gerar_notificacoes_aniversario(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gerar_notificacoes_aniversario(DATE) TO service_role;

-- 0 11 * * * = 08:00 em São Paulo (UTC−3). cron.schedule com nome substitui o job se já existir.
SELECT cron.schedule(
    'aniversario-diario',
    '0 11 * * *',
    'SELECT public.gerar_notificacoes_aniversario()'
);

-- -------------------------------------------------------------------------------------------
-- Campanhas (seção 6.10, POST /admin/campanhas)
-- -------------------------------------------------------------------------------------------
-- Uma notificação MARKETING para cada segurado com aceita_marketing = true. Com p_produto, só
-- para quem tem apólice ATIVA daquele produto. Devolve quantos segurados receberam.
CREATE OR REPLACE FUNCTION public.enviar_campanha(
    p_titulo TEXT,
    p_mensagem TEXT,
    p_produto TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_criadas INTEGER;
BEGIN
    INSERT INTO public.notificacao (perfil_id, tipo, titulo, mensagem)
    SELECT p.id, 'MARKETING', p_titulo, p_mensagem
    FROM public.perfil p
    WHERE p.papel = 'SEGURADO'
      AND p.aceita_marketing
      AND (
          p_produto IS NULL
          OR EXISTS (
              SELECT 1
              FROM public.apolice a
              WHERE a.perfil_id = p.id AND a.produto = p_produto AND a.status = 'ATIVA'
          )
      );

    GET DIAGNOSTICS v_criadas = ROW_COUNT;
    RETURN v_criadas;
END;
$$;

REVOKE ALL ON FUNCTION public.enviar_campanha(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enviar_campanha(TEXT, TEXT, TEXT) TO service_role;

-- -------------------------------------------------------------------------------------------
-- Fila do push (seção 6.9, POST /internal/push/pendentes)
-- -------------------------------------------------------------------------------------------
-- Reserva até p_limite notificações com push_enviado_em nulo, marcando-as na mesma instrução.
-- SKIP LOCKED: duas chamadas ao mesmo tempo nunca pegam a mesma notificação (sem push em dobro).
-- Se o envio falhar, a API devolve as que não saíram com public.liberar_push.
CREATE OR REPLACE FUNCTION public.reservar_push_pendentes(p_limite INTEGER DEFAULT 500)
RETURNS TABLE (
    id UUID,
    perfil_id UUID,
    titulo VARCHAR,
    mensagem TEXT,
    destino_tipo VARCHAR,
    destino_id UUID
)
LANGUAGE sql
SET search_path = ''
AS $$
    UPDATE public.notificacao n
    SET push_enviado_em = now()
    WHERE n.id IN (
        SELECT f.id
        FROM public.notificacao f
        WHERE f.push_enviado_em IS NULL
        ORDER BY f.criado_em
        LIMIT p_limite
        FOR UPDATE SKIP LOCKED
    )
    RETURNING n.id, n.perfil_id, n.titulo, n.mensagem, n.destino_tipo, n.destino_id;
$$;

CREATE OR REPLACE FUNCTION public.liberar_push(p_ids UUID[])
RETURNS VOID
LANGUAGE sql
SET search_path = ''
AS $$
    UPDATE public.notificacao SET push_enviado_em = NULL WHERE id = ANY (p_ids);
$$;

REVOKE ALL ON FUNCTION public.reservar_push_pendentes(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_push_pendentes(INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.liberar_push(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_push(UUID[]) TO service_role;
