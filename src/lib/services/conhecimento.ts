import { supabaseAdmin } from '@/lib/supabase/server';

export interface ConhecimentoItem {
  id: string;
  titulo: string;
  conteudo: string;
  categoria: string;
  atualizado_em: string;
  rank: number;
}

/**
 * Busca trechos relevantes na base de conhecimento usando Full-Text Search (tsvector) em português.
 * Usa a função RPC `buscar_conhecimento` criada na migration.
 */
export async function buscarConhecimento(
  consulta: string,
  limite: number = 4
): Promise<ConhecimentoItem[]> {
  const db = supabaseAdmin();
  const { data, error } = await db.rpc('buscar_conhecimento', {
    pergunta: consulta,
    limite,
  });

  if (error) {
    console.error('[conhecimento] erro na busca:', error);
    return [];
  }

  return (data ?? []) as ConhecimentoItem[];
}