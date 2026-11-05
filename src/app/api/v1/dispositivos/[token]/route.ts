import { type NextRequest, NextResponse } from 'next/server';
import { falhaBanco, naoEncontrado } from '@/lib/api-response';
import { exigirSessao } from '@/lib/security/sessao';
import { pushTokenSchema } from '@/lib/schemas/push';
import { removerDispositivo } from '@/lib/services/push';
import { comLog } from '@/lib/http/log';

// DELETE /api/v1/dispositivos/{token} — remove o token no logout (seção 6.9).
// O token vai codificado na URL (encodeURIComponent), por causa dos colchetes.
async function del(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const sessao = await exigirSessao(req);
  if (sessao instanceof Response) return sessao;

  let bruto: string;
  try {
    bruto = decodeURIComponent((await params).token);
  } catch {
    return naoEncontrado('Dispositivo');
  }
  const token = pushTokenSchema.safeParse(bruto);
  if (!token.success) return naoEncontrado('Dispositivo');

  try {
    const removido = await removerDispositivo(sessao.perfil_id, token.data);
    return removido ? new NextResponse(null, { status: 204 }) : naoEncontrado('Dispositivo');
  } catch (e) {
    return falhaBanco('dispositivos/token', e);
  }
}

export const DELETE = comLog(del);
