-- Sub-issue #54: Base de conhecimento RAG com Full-Text Search (tsvector) em português
-- Tabela: conhecimento (id, titulo, conteudo, categoria, atualizado_em, busca)

CREATE TABLE IF NOT EXISTS public.conhecimento (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    titulo VARCHAR(200) NOT NULL,
    conteudo TEXT NOT NULL,
    categoria VARCHAR(50) NOT NULL, -- 'APP_USO', 'SINISTRO', 'COTACAO', 'APOLICE', 'GERAL'
    atualizado_em TIMESTAMPTZ DEFAULT now() NOT NULL,
    -- tsvector para busca full-text em português (coluna chamada 'busca')
    busca tsvector GENERATED ALWAYS AS (
        to_tsvector('portuguese', titulo || ' ' || conteudo)
    ) STORED
);

-- Índice GIN para busca full-text rápida
CREATE INDEX IF NOT EXISTS conhecimento_busca_idx ON public.conhecimento USING GIN (busca);

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

-- Função RPC: buscar_conhecimento(pergunta text, limite int default 4)
-- Usa websearch_to_tsquery para melhor parsing da query do usuário
CREATE OR REPLACE FUNCTION public.buscar_conhecimento(
    pergunta TEXT,
    limite INT DEFAULT 4
)
RETURNS TABLE (
    id UUID,
    titulo VARCHAR,
    conteudo TEXT,
    categoria VARCHAR,
    atualizado_em TIMESTAMPTZ,
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
        k.atualizado_em,
        ts_rank(k.busca, websearch_to_tsquery('portuguese', pergunta)) AS rank
    FROM public.conhecimento k
    WHERE k.busca @@ websearch_to_tsquery('portuguese', pergunta)
    ORDER BY rank DESC
    LIMIT limite;
$$;

REVOKE ALL ON FUNCTION public.buscar_conhecimento(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_conhecimento(TEXT, INT) TO service_role;