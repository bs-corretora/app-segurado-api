import { z } from 'zod';

// Schemas da Etapa 4: cotação (seção 6.7) e indicação (seção 6.8).

/** Mesmo domínio do CHECK `check_cotacao_produto` / `check_apolice_produto`. */
export const PRODUTOS_COTACAO = ['AUTO', 'RESIDENCIAL', 'VIDA', 'EMPRESARIAL'] as const;

/** Campos do formulário, variáveis por produto: só valores simples, até 30 campos e 4 KB. */
const dadosCotacao = z
  .record(
    z.string().min(1).max(60),
    z.union([z.string().max(500), z.number(), z.boolean(), z.null()]),
    { error: 'dados deve ser um objeto com valores simples (texto, número ou sim/não)' },
  )
  .refine((d) => Object.keys(d).length <= 30, 'dados com no máximo 30 campos')
  .refine((d) => JSON.stringify(d).length <= 4000, 'dados com no máximo 4 KB');

export const cotacaoSchema = z.object({
  produto: z.enum(PRODUTOS_COTACAO, { error: `produto deve ser um de: ${PRODUTOS_COTACAO.join(', ')}` }),
  motivo: z.enum(['NOVO', 'RENOVACAO'], { error: 'motivo deve ser NOVO ou RENOVACAO' }),
  dados: dadosCotacao.optional(),
});

export type NovaCotacao = z.infer<typeof cotacaoSchema>;

/** Código de indicação: o mesmo formato de perfil.codigo_indicacao (até 12 caracteres). */
export const codigoIndicacaoSchema = z.string().regex(/^[A-Za-z0-9]{3,12}$/);

export const indicadoSchema = z.object({
  nome: z.string().trim().min(2, 'nome com no mínimo 2 caracteres').max(120, 'nome com no máximo 120 caracteres'),
  // Aceita com ou sem máscara; grava só os dígitos (DDD + número).
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{10,11}$/, 'telefone deve ter DDD + número (10 ou 11 dígitos)')),
  email: z
    .string()
    .trim()
    .max(160, 'e-mail com no máximo 160 caracteres')
    .transform((v) => (v === '' ? undefined : v.toLowerCase()))
    .pipe(z.email('e-mail inválido').optional())
    .optional(),
});

export type Indicado = z.infer<typeof indicadoSchema>;
