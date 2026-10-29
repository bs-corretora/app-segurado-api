import { connection } from 'next/server';
import { erro } from '@/lib/api-response';
import { docsLigado } from '@/lib/env';

// GET /api/docs — Swagger UI (seção 6.11). Mesma origem da API: o cookie de
// sessão gravado pelo "Try it out" do login vale para as rotas seguintes.
const SWAGGER = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14';

const PAGINA = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>App do Segurado — API</title>
  <link rel="stylesheet" href="${SWAGGER}/swagger-ui.css" />
  <style>body { margin: 0; } .swagger-ui .topbar { display: none; }</style>
</head>
<body>
  <div id="swagger"></div>
  <script src="${SWAGGER}/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger',
      withCredentials: true,
      persistAuthorization: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      docExpansion: 'list',
      defaultModelsExpandDepth: -1,
    });
  </script>
</body>
</html>`;

export async function GET() {
  // Lê API_DOCS em tempo real: sem isto o Next gera a rota no build, sem o .env.
  await connection();
  if (!docsLigado()) return erro(404, 'NAO_ENCONTRADO', 'Recurso não encontrado');
  return new Response(PAGINA, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
