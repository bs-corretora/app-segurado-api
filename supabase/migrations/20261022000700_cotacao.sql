-- Cotações de seguro, vinculadas a perfis, com dados em JSON e status de análise

CREATE TABLE public.cotacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_id UUID NOT NULL REFERENCES public.perfil(id) ON DELETE CASCADE,
    produto VARCHAR(30) NOT NULL,
    motivo VARCHAR(20) NOT NULL, -- Coluna adicional para indicar se é uma cotação nova ou renovação
    dados JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'RECEBIDA',
    resposta TEXT,
    valor_estimado NUMERIC(12,2),
    respondida_em TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_cotacao_produto CHECK (produto IN ('AUTO', 'RESIDENCIAL', 'VIDA', 'EMPRESARIAL')),
    CONSTRAINT check_cotacao_motivo CHECK (motivo IN ('NOVO', 'RENOVACAO')),
    CONSTRAINT check_cotacao_status CHECK (status IN ('RECEBIDA', 'EM_ANALISE', 'RESPONDIDA'))
);

CREATE INDEX idx_cotacao_perfil ON public.cotacao (perfil_id);

ALTER TABLE public.cotacao ENABLE ROW LEVEL SECURITY;
