import { z } from 'zod';

// Schemas das rotas de leitura do app (seções 6.4 a 6.9).

// z.guid(), não z.uuid(): o Postgres aceita qualquer uuid no formato 8-4-4-4-12, e os ids
// do seed (6f1c1111-1111-1111-…) não seguem a versão/variante que o z.uuid() exige.
export const idSchema = z.guid();

export const contatosQuerySchema = z.object({
  tipo: z.enum(['ASSISTENCIA_24H', 'SINISTRO'], {
    error: 'tipo deve ser ASSISTENCIA_24H ou SINISTRO',
  }),
});

export const notificacoesQuerySchema = z.object({
  nao_lidas: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
