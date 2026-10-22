-- Indicações de novos clientes, vinculadas a perfis existentes

CREATE TABLE public.indicacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    indicador_id UUID NOT NULL REFERENCES public.perfil(id) ON DELETE CASCADE,
    nome VARCHAR(120) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    email VARCHAR(160),
    status VARCHAR(20) NOT NULL DEFAULT 'NOVA',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_indicacao_status CHECK (status IN ('NOVA', 'CONTATADA', 'CONVERTIDA'))
);

CREATE INDEX idx_indicacao_indicador ON public.indicacao (indicador_id);

ALTER TABLE public.indicacao ENABLE ROW LEVEL SECURITY;
