-- Tabela de perfis de usuários (clientes e administradores)

CREATE TABLE public.perfil (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cpf VARCHAR(11) NOT NULL UNIQUE,
    nome VARCHAR(120) NOT NULL,
    telefone VARCHAR(20),
    data_nascimento DATE NOT NULL,
    cliente_desde DATE NOT NULL DEFAULT CURRENT_DATE,
    papel VARCHAR(20) NOT NULL DEFAULT 'SEGURADO',
    codigo_indicacao VARCHAR(12) NOT NULL UNIQUE,
    aceita_marketing BOOLEAN NOT NULL DEFAULT true,
    termos_aceitos_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_perfil_cpf_valido CHECK (public.cpf_valido(cpf)),
    CONSTRAINT check_perfil_papel CHECK (papel IN ('SEGURADO', 'ADMIN'))
);

ALTER TABLE public.perfil ENABLE ROW LEVEL SECURITY;
