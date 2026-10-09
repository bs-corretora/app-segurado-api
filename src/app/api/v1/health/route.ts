import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';
import { successResponse, errorResponse } from '@/lib/api-response';

export async function GET() {
  try {
    const supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { error } = await supabase.from('_health_check_dummy').select('*').limit(0);

    if (error && error.code !== 'PGRST205' && error.code !== '42P01') {
      return errorResponse('Erro de conexão com o banco de dados', 500, error);
    }

    return successResponse({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro interno do servidor';
    return errorResponse(message, 500);
  }
}