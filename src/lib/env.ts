import { z } from 'zod';

// Nomes conforme a seção 8.2 da especificação.
// Sem NEXT_PUBLIC_: nenhuma chave do Supabase vai para o cliente (seção 2.2),
// e NEXT_PUBLIC_* é embutido no build, o que quebra o build do Docker sem .env.
const envSchema = z.object({
  SUPABASE_URL: z.url('SUPABASE_URL inválida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatória'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean))
    .refine((list) => !list.includes('*'), 'CORS_ALLOWED_ORIGINS não aceita "*"'),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  INTERNAL_API_KEY: z.string().optional(),
    // Endereço público da API/página (ex.: https://api.exemplo.com.br), sem barra no fim. Usado no link
  // de indicação. Sem valor, o link usa o endereço da própria requisição.
  PUBLIC_BASE_URL: z
    .url('PUBLIC_BASE_URL inválida')
    .transform((v) => v.replace(/\/+$/, ''))
    .optional(),
  // /api/docs e /api/openapi.json (seção 6.11). Sem valor: ligado fora de produção.
  API_DOCS: z.enum(['true', 'false']).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Lê e valida o ambiente na primeira chamada (não no import).
 * Assim o `next build` não precisa do .env; a validação no start
 * fica em src/instrumentation.ts.
 */
export function getEnv(): Env {
  if (cached) return cached;
  // O docker compose repassa variável não definida no .env como string vazia.
  // Vazio conta como ausente: assim valem os defaults (COOKIE_SECURE=true) e
  // uma chave opcional em branco (INTERNAL_API_KEY) não vira segredo "".
  const definidas = Object.fromEntries(
    Object.entries(process.env).filter(([, valor]) => valor !== ''),
  );
  const parsed = envSchema.safeParse(definidas);
  if (!parsed.success) {
    const detalhes = z.prettifyError(parsed.error);
    throw new Error(`Variáveis de ambiente inválidas ou ausentes:\n${detalhes}`);
  }
  cached = parsed.data;
  return cached;
}

/** Swagger ligado? Em produção só com API_DOCS=true (seção 6.11). */
export function docsLigado(): boolean {
  const { API_DOCS } = getEnv();
  if (API_DOCS) return API_DOCS === 'true';
  return process.env.NODE_ENV !== 'production';
}
