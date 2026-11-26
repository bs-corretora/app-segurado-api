-- Avisos por e-mail (#72): fila do e-mail na própria notificacao, como a do push.
--
-- Entram na fila só as notificações SISTEMA com destino SINISTRO ou COTACAO (mudança de status
-- do sinistro e cotação respondida). Aniversário e campanha não vão por e-mail.
--
-- email_enviado_em  nulo = falta enviar. Preenchido na reserva (antes do envio).
-- email_tentativas  quantas vezes a API tentou. Na 3ª falha a notificação sai da fila.

ALTER TABLE public.notificacao
    ADD COLUMN email_enviado_em TIMESTAMPTZ,
    ADD COLUMN email_tentativas SMALLINT NOT NULL DEFAULT 0;

-- Ninguém recebe e-mail de aviso antigo: o que já existia conta como enviado.
UPDATE public.notificacao SET email_enviado_em = criado_em;

CREATE INDEX idx_notificacao_email_pendente ON public.notificacao (criado_em)
    WHERE email_enviado_em IS NULL
      AND email_tentativas < 3
      AND tipo = 'SISTEMA'
      AND destino_tipo IN ('SINISTRO', 'COTACAO');

-- Reserva até p_limite notificações da fila do e-mail, marcando envio e tentativa na mesma
-- instrução. SKIP LOCKED: duas chamadas ao mesmo tempo (rota do admin e job) nunca pegam a mesma
-- notificação. Com p_destino_id, só as daquele sinistro ou cotação (envio na hora, pela rota do
-- admin). Se o envio falhar, a API devolve as que não saíram com public.liberar_email.
CREATE OR REPLACE FUNCTION public.reservar_email_pendentes(
    p_limite INTEGER DEFAULT 50,
    p_destino_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    perfil_id UUID,
    destino_tipo VARCHAR,
    destino_id UUID,
    criado_em TIMESTAMPTZ,
    email_tentativas SMALLINT
)
LANGUAGE sql
SET search_path = ''
AS $$
    UPDATE public.notificacao n
    SET email_enviado_em = now(),
        email_tentativas = n.email_tentativas + 1
    WHERE n.id IN (
        SELECT f.id
        FROM public.notificacao f
        WHERE f.email_enviado_em IS NULL
          AND f.email_tentativas < 3
          AND f.tipo = 'SISTEMA'
          AND f.destino_tipo IN ('SINISTRO', 'COTACAO')
          AND (p_destino_id IS NULL OR f.destino_id = p_destino_id)
        ORDER BY f.criado_em
        LIMIT p_limite
        FOR UPDATE SKIP LOCKED
    )
    RETURNING n.id, n.perfil_id, n.destino_tipo, n.destino_id, n.criado_em, n.email_tentativas;
$$;

CREATE OR REPLACE FUNCTION public.liberar_email(p_ids UUID[])
RETURNS VOID
LANGUAGE sql
SET search_path = ''
AS $$
    UPDATE public.notificacao SET email_enviado_em = NULL WHERE id = ANY (p_ids);
$$;

REVOKE ALL ON FUNCTION public.reservar_email_pendentes(INTEGER, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_email_pendentes(INTEGER, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.liberar_email(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.liberar_email(UUID[]) TO service_role;
