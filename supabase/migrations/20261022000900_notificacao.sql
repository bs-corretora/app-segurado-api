-- Notificações, vinculadas a perfis, com tipos e destinos variados

CREATE TABLE public.notificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_id UUID NOT NULL REFERENCES public.perfil(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL,
    titulo VARCHAR(120) NOT NULL,
    mensagem TEXT NOT NULL,
    destino_tipo VARCHAR(20),
    destino_id UUID,
    lida_em TIMESTAMPTZ,
    push_enviado_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_notificacao_tipo CHECK (tipo IN ('MARKETING', 'ANIVERSARIO', 'SISTEMA')),
    CONSTRAINT check_notificacao_destino_tipo CHECK (destino_tipo IS NULL OR destino_tipo IN ('SINISTRO', 'COTACAO', 'APOLICE')),
    CONSTRAINT check_notificacao_destino CHECK ((destino_tipo IS NULL) = (destino_id IS NULL))
);

CREATE INDEX idx_notificacao_perfil ON public.notificacao (perfil_id, criado_em DESC);
-- Fila do push: só as que ainda não foram enviadas
CREATE INDEX idx_notificacao_push_pendente ON public.notificacao (criado_em) WHERE push_enviado_em IS NULL;

ALTER TABLE public.notificacao ENABLE ROW LEVEL SECURITY;
