-- Sub-issue #54: Base de conhecimento RAG com Full-Text Search (tsvector) em português
-- Tabela para armazenar trechos de conhecimento (FAQ, regras, fluxos) com busca textual

CREATE TABLE IF NOT EXISTS public.conhecimento (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    titulo VARCHAR(200) NOT NULL,
    conteudo TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL, -- 'APP_USO', 'SINISTRO', 'COTACAO', 'APOLICE', 'GERAL'
    tags TEXT[] DEFAULT '{}',
    -- tsvector para busca full-text em português
    busca_tsv tsvector GENERATED ALWAYS AS (
        to_tsvector('portuguese', titulo || ' ' || conteudo)
    ) STORED,
    criado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
    atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Índice GIN para busca full-text rápida
CREATE INDEX IF NOT EXISTS conhecimento_busca_tsv_idx ON public.conhecimento USING GIN (busca_tsv);

-- Índice por categoria para filtros
CREATE INDEX IF NOT EXISTS conhecimento_categoria_idx ON public.conhecimento (categoria);

-- Trigger para atualizar 'atualizado_em'
CREATE OR REPLACE FUNCTION public.atualizar_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.atualizado_em = now();
    RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS trigger_conhecimento_atualizado_em ON public.conhecimento;
CREATE TRIGGER trigger_conhecimento_atualizado_em
BEFORE UPDATE ON public.conhecimento
FOR EACH ROW EXECUTE FUNCTION public.atualizar_timestamp();

-- RLS: apenas service_role (a API) pode ler/escrever; anon/authenticated não têm acesso direto
ALTER TABLE public.conhecimento ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.conhecimento FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conhecimento TO service_role;

-- Função de busca full-text para o RAG
-- Retorna os trechos mais relevantes ordenados por rank (ts_rank_cd)
CREATE OR REPLACE FUNCTION public.conhecimento_buscar(
    p_consulta TEXT,
    p_limite INTEGER DEFAULT 5,
    p_categoria TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    titulo VARCHAR,
    conteudo TEXT,
    categoria VARCHAR,
    tags TEXT[],
    rank REAL
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT
        k.id,
        k.titulo,
        k.conteudo,
        k.categoria,
        k.tags,
        ts_rank_cd(k.busca_tsv, plainto_tsquery('portuguese', p_consulta)) AS rank
    FROM public.conhecimento k
    WHERE k.busca_tsv @@ plainto_tsquery('portuguese', p_consulta)
      AND (p_categoria IS NULL OR k.categoria = p_categoria)
    ORDER BY rank DESC
    LIMIT p_limite;
$$;

REVOKE ALL ON FUNCTION public.conhecimento_buscar(TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conhecimento_buscar(TEXT, INTEGER, TEXT) TO service_role;