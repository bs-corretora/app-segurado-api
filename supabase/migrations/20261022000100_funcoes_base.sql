-- Etapa 1: base comum às migrations seguintes (sequência do protocolo e validação de CPF).
-- As tabelas da seção 5.3 vêm uma por arquivo, na ordem das dependências, todas com RLS ligado
-- e sem policy: só a service_role (usada pela API) enxerga os dados.

-- Sequência para os protocolos de sinistro
CREATE SEQUENCE IF NOT EXISTS public.sinistro_protocolo_seq START WITH 1 INCREMENT BY 1;

-- Valida o CPF pelos dois dígitos verificadores (rejeita também os 11 dígitos repetidos)
CREATE OR REPLACE FUNCTION public.cpf_valido(cpf TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    soma INT;
    resto INT;
    i INT;
BEGIN
    IF cpf IS NULL OR cpf !~ '^[0-9]{11}$' OR cpf ~ '^(.)\1{10}$' THEN
        RETURN false;
    END IF;

    soma := 0;
    FOR i IN 1..9 LOOP
        soma := soma + substr(cpf, i, 1)::INT * (11 - i);
    END LOOP;
    resto := (soma * 10) % 11;
    IF resto = 10 THEN resto := 0; END IF;
    IF resto <> substr(cpf, 10, 1)::INT THEN
        RETURN false;
    END IF;

    soma := 0;
    FOR i IN 1..10 LOOP
        soma := soma + substr(cpf, i, 1)::INT * (12 - i);
    END LOOP;
    resto := (soma * 10) % 11;
    IF resto = 10 THEN resto := 0; END IF;
    RETURN resto = substr(cpf, 11, 1)::INT;
END;
$$;
