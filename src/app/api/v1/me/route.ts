import { type NextRequest } from 'next/server';
import { ok, erro } from '@/lib/api-response';
import { usuarioAutenticado } from '@/lib/security/sessao';

// GET /api/v1/me — exige sessão (seção 6.3).
// PROVISÓRIO: só confirma que a sessão por cookie funciona. Depois da Etapa 1,
// passa a devolver os dados da tabela `perfil` (nome, iniciais, telefone etc.).
export async function GET(req: NextRequest) {
  const usuario = await usuarioAutenticado(req);
  if (!usuario) return erro(401, 'NAO_AUTENTICADO', 'Sessão ausente ou expirada');
  return ok({ id: usuario.id, email: usuario.email });
}
