-- Tabela de sinistros, vinculando perfis e apólices, com histórico de eventos

CREATE TABLE public.sinistro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perfil_id UUID NOT NULL REFERENCES public.perfil(id) ON DELETE CASCADE,
    -- RESTRICT: um sinistro não some junto com a apólice
    apolice_id UUID NOT NULL REFERENCES public.apolice(id) ON DELETE RESTRICT,
    protocolo VARCHAR(20) UNIQUE,
    tipo VARCHAR(30) NOT NULL,
    data_ocorrencia TIMESTAMPTZ NOT NULL,
    local VARCHAR(200),
    descricao TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'ABERTO',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT check_sinistro_tipo CHECK (tipo IN ('COLISAO', 'ROUBO', 'INCENDIO', 'DANO_ELETRICO', 'OUTROS')),
    CONSTRAINT check_sinistro_status CHECK (status IN ('ABERTO', 'EM_ANALISE', 'CONCLUIDO')),
    CONSTRAINT check_sinistro_data_ocorrencia CHECK (data_ocorrencia <= now())
);

CREATE INDEX idx_sinistro_perfil ON public.sinistro (perfil_id);
CREATE INDEX idx_sinistro_apolice ON public.sinistro (apolice_id);

ALTER TABLE public.sinistro ENABLE ROW LEVEL SECURITY;

-- Function & Trigger para gerar protocolo SIN-AAAA-NNNNNN
CREATE OR REPLACE FUNCTION public.gerar_protocolo_sinistro()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.protocolo IS NULL THEN
        NEW.protocolo := 'SIN-' || to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY') || '-'
            || lpad(nextval('public.sinistro_protocolo_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_gerar_protocolo_sinistro
BEFORE INSERT ON public.sinistro
FOR EACH ROW
EXECUTE FUNCTION public.gerar_protocolo_sinistro();

-- A apólice do sinistro tem que pertencer ao mesmo perfil (seção 5.3)
CREATE OR REPLACE FUNCTION public.validar_apolice_do_sinistro()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.apolice
        WHERE id = NEW.apolice_id AND perfil_id = NEW.perfil_id
    ) THEN
        RAISE EXCEPTION 'A apólice % não pertence ao perfil %', NEW.apolice_id, NEW.perfil_id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_validar_apolice_do_sinistro
BEFORE INSERT OR UPDATE OF apolice_id, perfil_id ON public.sinistro
FOR EACH ROW
EXECUTE FUNCTION public.validar_apolice_do_sinistro();

-- Mantém atualizado_em em dia a cada mudança do sinistro
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.atualizado_em := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_sinistro_atualizado_em
BEFORE UPDATE ON public.sinistro
FOR EACH ROW
EXECUTE FUNCTION public.tocar_atualizado_em();
