-- Dispositivos móveis para envio de notificações push, vinculados a perfis

CREATE TABLE public.dispositivo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_id UUID NOT NULL REFERENCES public.perfil(id) ON DELETE CASCADE,
    push_token VARCHAR(255) NOT NULL UNIQUE,
    plataforma VARCHAR(10) NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_dispositivo_plataforma CHECK (plataforma IN ('ANDROID', 'IOS'))
);

CREATE INDEX idx_dispositivo_perfil ON public.dispositivo (perfil_id);

ALTER TABLE public.dispositivo ENABLE ROW LEVEL SECURITY;
