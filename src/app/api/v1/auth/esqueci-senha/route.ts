import { type NextRequest, NextResponse } from 'next/server';
import { supabaseAuth } from '@/lib/supabase/server';
import { erro, erroValidacao } from '@/lib/api-response';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { esqueciSenhaSchema } from '@/lib/schemas/conta';

// POST /api/v1/auth/esqueci-senha — pública (seção 6.3). Rate limit: 3/min por IP (7.2).
// Responde 204 sempre que a entrada é válida: não revela se o e-mail tem conta.
export async function POST(req: NextRequest) {
  const bloqueio = await limitar('esqueciSenha', ipDe(req));
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = esqueciSenhaSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  const { error } = await supabaseAuth().auth.resetPasswordForEmail(entrada.data.email);
  if (error) console.error('[esqueci-senha]', error.message);

  return new NextResponse(null, { status: 204 });
}
