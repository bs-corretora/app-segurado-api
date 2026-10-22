-- Histórico de sinistros, com status e comentários

CREATE TABLE public.sinistro_evento (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sinistro_id UUID NOT NULL REFERENCES public.sinistro(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    comentario TEXT,
    autor_id UUID REFERENCES public.perfil(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_sinistro_evento_status CHECK (status IN ('ABERTO', 'EM_ANALISE', 'CONCLUIDO'))
);

CREATE INDEX idx_sinistro_evento_sinistro ON public.sinistro_evento (sinistro_id, criado_em);

ALTER TABLE public.sinistro_evento ENABLE ROW LEVEL SECURITY;
