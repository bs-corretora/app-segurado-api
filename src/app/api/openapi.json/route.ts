import { connection } from 'next/server';
import { ok, erro } from '@/lib/api-response';
import { docsLigado } from '@/lib/env';
import { especificacaoOpenApi } from '@/lib/openapi';

// GET /api/openapi.json — especificação OpenAPI 3 (seção 6.11).
export async function GET() {
  // Lê API_DOCS em tempo real: sem isto o Next gera a rota no build, sem o .env.
  await connection();
  if (!docsLigado()) return erro(404, 'NAO_ENCONTRADO', 'Recurso não encontrado');
  return ok(especificacaoOpenApi());
}
