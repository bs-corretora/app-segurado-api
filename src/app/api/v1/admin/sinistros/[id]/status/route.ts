import { type NextRequest } from 'next/server';
import { ok, erroValidacao, falhaBanco } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { comLog } from '@/lib/http/log';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Validação ajustada do Zod (sem required_error no z.string())
const atualizarStatusSchema = z.object({
  status: z.string({ message: 'O campo status é obrigatório' }).min(1, 'O status não pode estar vazio'),
});

async function patch(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // 1. Valida sessão e papel de ADMIN
  const sessao = await exigirSessao(req, { papel: 'ADMIN' });
  if (sessao instanceof Response) return sessao;

  const sinistroId = params.id;

  // 2. Valida o corpo da requisição com Zod
  const body = await req.json().catch(() => ({}));
  const validacao = atualizarStatusSchema.safeParse(body);

  if (!validacao.success) {
    return erroValidacao(validacao.error);
  }

  const { status } = validacao.data;

  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || '';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    // 3. Busca o sinistro para obter o segurado_id
    const { data: sinistro, error: fetchError } = await supabase
      .from('sinistro')
      .select('id, segurado_id')
      .eq('id', sinistroId)
      .single();

    if (fetchError || !sinistro) {
      return falhaBanco('admin/sinistros/patch', fetchError || new Error('Sinistro não encontrado'));
    }

    // 4. Atualiza o status do sinistro
    const { data: sinistroAtualizado, error: updateError } = await supabase
      .from('sinistro')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', sinistroId)
      .select()
      .single();

    if (updateError) {
      return falhaBanco('admin/sinistros/patch', updateError);
    }

    // 5. Grava a notificação do segurado (Exigência da Issue)
    await supabase.from('notificacao').insert({
      segurado_id: sinistro.segurado_id,
      titulo: 'Atualização de Sinistro',
      mensagem: `Seu sinistro mudou de status para ${status}`,
      tipo: 'SINISTRO',
      referencia_id: sinistroId,
      lida: false,
      created_at: new Date().toISOString(),
    });

    return ok(sinistroAtualizado);
  } catch (e) {
    return falhaBanco('admin/sinistros/patch', e);
  }
}

export const PATCH = comLog(patch);