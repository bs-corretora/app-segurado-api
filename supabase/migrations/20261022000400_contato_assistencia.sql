-- Tabela para armazenar informações sobre contatos de assistência

CREATE TABLE public.contato_assistencia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(20) NOT NULL,
    produto VARCHAR(30),
    rotulo VARCHAR(80) NOT NULL,
    telefone VARCHAR(20),
    whatsapp VARCHAR(20),
    ativo BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT check_contato_tipo CHECK (tipo IN ('ASSISTENCIA_24H', 'SINISTRO')),
    CONSTRAINT check_contato_produto CHECK (produto IS NULL OR produto IN ('AUTO', 'RESIDENCIAL', 'VIDA', 'EMPRESARIAL'))
);

ALTER TABLE public.contato_assistencia ENABLE ROW LEVEL SECURITY;
