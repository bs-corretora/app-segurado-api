import { z } from 'zod';
import { idSchema } from '@/lib/schemas/app';

// Schemas das rotas de sinistro (seção 6.6). Ficam fora dos route.ts porque também alimentam o OpenAPI.

/** Mesmo domínio do CHECK `check_sinistro_tipo` do banco. */
export const TIPOS_SINISTRO = ['COLISAO', 'ROUBO', 'INCENDIO', 'DANO_ELETRICO', 'OUTROS'] as const;

// Texto opcional: vazio vira "não informado" (undefined), para não gravar '' no banco.
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `no máximo ${max} caracteres`)
    .transform((v) => (v === '' ? undefined : v))
    .optional();

export const abrirSinistroSchema = z.object({
  apolice_id: idSchema,
  tipo: z.enum(TIPOS_SINISTRO, {
    error: `tipo deve ser um de: ${TIPOS_SINISTRO.join(', ')}`,
  }),
  // Com fuso (ex.: 2026-10-29T14:30:00-03:00): o banco guarda timestamptz.
  data_ocorrencia: z.iso
    .datetime({ offset: true, error: 'data_ocorrencia deve estar no formato AAAA-MM-DDThh:mm:ss±hh:mm' })
    .refine((d) => new Date(d).getTime() <= Date.now(), 'data_ocorrencia não pode ser futura'),
  local: textoOpcional(200),
  descricao: textoOpcional(2000),
});

export type AbrirSinistro = z.infer<typeof abrirSinistroSchema>;