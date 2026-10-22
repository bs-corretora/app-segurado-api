-- Tabela para armazenar informações sobre apólices de seguro

CREATE TABLE public.apolice (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cpf_titular VARCHAR(11) NOT NULL,
    perfil_id UUID REFERENCES public.perfil(id) ON DELETE SET NULL,
    numero VARCHAR(30) NOT NULL UNIQUE,
    produto VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ATIVA',
    inicio_vigencia DATE NOT NULL,
    fim_vigencia DATE NOT NULL,
    premio NUMERIC(12,2),
    pdf_caminho VARCHAR(255),
    CONSTRAINT check_apolice_cpf_digits CHECK (cpf_titular ~ '^[0-9]{11}$'),
    CONSTRAINT check_apolice_produto CHECK (produto IN ('AUTO', 'RESIDENCIAL', 'VIDA', 'EMPRESARIAL')),
    CONSTRAINT check_apolice_status CHECK (status IN ('ATIVA', 'VENCIDA', 'CANCELADA')),
    CONSTRAINT check_apolice_vigencia CHECK (fim_vigencia > inicio_vigencia),
    -- Formato PP-AAAA-NNNNNN, com o prefixo de acordo com o produto
    CONSTRAINT check_apolice_numero CHECK (
        numero ~ '^(AU|RE|VI|EM)-[0-9]{4}-[0-9]{6}$'
        AND left(numero, 2) = CASE produto
            WHEN 'AUTO' THEN 'AU'
            WHEN 'RESIDENCIAL' THEN 'RE'
            WHEN 'VIDA' THEN 'VI'
            WHEN 'EMPRESARIAL' THEN 'EM'
        END
    )
);

CREATE INDEX idx_apolice_perfil ON public.apolice (perfil_id);
CREATE INDEX idx_apolice_cpf_titular ON public.apolice (cpf_titular);

ALTER TABLE public.apolice ENABLE ROW LEVEL SECURITY;
