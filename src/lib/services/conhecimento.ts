import { supabaseAdmin } from '@/lib/supabase/server';

export interface ConhecimentoItem {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  tags: string[];
  rank: number;
}

/**
 * Busca trechos relevantes na base de conhecimento usando Full-Text Search (tsvector) em português.
 * Usa a função RPC `conhecimento_buscar` criada na migration.
 */
export async function buscarConhecimento(
  consulta: string,
  limite: number = 5,
  categoria?: string
): Promise<ConhecimentoItem[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('conhecimento_buscar', {
    p_consulta: consulta,
    p_limite: limite,
    p_categoria: categoria ?? null,
  });

  if (error) {
    console.error('[conhecimento] erro na busca:', error);
    return [];
  }

  return (data ?? []) as ConhecimentoItem[];
}