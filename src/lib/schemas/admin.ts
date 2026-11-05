import { z } from 'zod';

// Schemas das rotas de administração (seção 6.10). Ficam fora dos route.ts porque também
// alimentam o OpenAPI.

export const STATUS_SINISTRO = ['ABERTO', 'EM_ANALISE', 'CONCLUIDO'] as const;
export const STATUS_COTACAO = ['RECEBIDA', 'EM_ANALISE', 'RESPONDIDA'] as const;
export const STATUS_INDICACAO = ['NOVA', 'CONTATADA', 'CONVERTIDA'] as const;
export const TIPOS_CONTATO = ['ASSISTENCIA_24H', 'SINISTRO'] as const;
export const PRODUTOS_CONTATO = ['AUTO', 'RESIDENCIAL', 'VIDA', 'EMPRESARIAL'] as const;

const lista = (valores: readonly string[]) => valores.join(', ');

/** ?status= opcional, com o domínio do CHECK da tabela. */
function filtroStatus<T extends readonly [string, ...string[]]>(valores: T) {
  return z.object({
    status: z.enum(valores, { error: `status deve ser um de: ${lista(valores)}` }).optional(),
  });
}

export const sinistrosFiltroSchema = filtroStatus(STATUS_SINISTRO);
export const cotacoesFiltroSchema = filtroStatus(STATUS_COTACAO);
export const indicacoesFiltroSchema = filtroStatus(STATUS_INDICACAO);

export const buscaSeguradosSchema = z.object({
  // Nome, CPF (com ou sem pontuação) ou e-mail. Vazio: todos os segurados.
  busca: z
    .string()
    .trim()
    .max(120, 'busca com no máximo 120 caracteres')
    .transform((v) => (v === '' ? undefined : v))
    .optional(),
});

export const statusSinistroSchema = z.object({
  // ABERTO não entra: o sinistro só anda para a frente.
  status: z.enum(['EM_ANALISE', 'CONCLUIDO'], { error: 'status deve ser EM_ANALISE ou CONCLUIDO' }),
  comentario: z
    .string({ error: 'comentario obrigatório' })
    .trim()
    .min(1, 'comentario obrigatório')
    .max(1000, 'comentario com no máximo 1000 caracteres'),
});

export const respostaCotacaoSchema = z.object({
  resposta: z
    .string({ error: 'resposta obrigatória' })
    .trim()
    .min(1, 'resposta obrigatória')
    .max(2000, 'resposta com no máximo 2000 caracteres'),
  // NUMERIC(12,2): até 9.999.999.999,99.
  valor_estimado: z
    .number({ error: 'valor_estimado deve ser um número' })
    .nonnegative('valor_estimado não pode ser negativo')
    .max(9_999_999_999.99, 'valor_estimado muito alto')
    .multipleOf(0.01, 'valor_estimado com no máximo 2 casas decimais')
    .optional(),
});

export const statusIndicacaoSchema = z.object({
  status: z.enum(['CONTATADA', 'CONVERTIDA'], { error: 'status deve ser CONTATADA ou CONVERTIDA' }),
});

const telefone = z
  .string()
  .trim()
  .regex(/^[0-9]{8,20}$/, 'só dígitos, de 8 a 20');

export const contatosFiltroSchema = z.object({
  tipo: z.enum(TIPOS_CONTATO, { error: `tipo deve ser um de: ${lista(TIPOS_CONTATO)}` }).optional(),
});

const camposContato = {
  tipo: z.enum(TIPOS_CONTATO, { error: `tipo deve ser um de: ${lista(TIPOS_CONTATO)}` }),
  // null = vale para todos os produtos.
  produto: z
    .enum(PRODUTOS_CONTATO, { error: `produto deve ser um de: ${lista(PRODUTOS_CONTATO)}` })
    .nullable(),
  rotulo: z.string().trim().min(1, 'rotulo obrigatório').max(80, 'rotulo com no máximo 80 caracteres'),
  telefone: telefone.nullable(),
  whatsapp: telefone.nullable(),
  ativo: z.boolean({ error: 'ativo deve ser true ou false' }),
};

export const novoContatoSchema = z
  .object({
    ...camposContato,
    produto: camposContato.produto.optional().default(null),
    telefone: camposContato.telefone.optional().default(null),
    whatsapp: camposContato.whatsapp.optional().default(null),
    ativo: camposContato.ativo.optional().default(true),
  })
  .refine((c) => c.telefone !== null || c.whatsapp !== null, {
    message: 'informe telefone ou whatsapp',
    path: ['telefone'],
  });

export const alterarContatoSchema = z
  .object({
    tipo: camposContato.tipo.optional(),
    produto: camposContato.produto.optional(),
    rotulo: camposContato.rotulo.optional(),
    telefone: camposContato.telefone.optional(),
    whatsapp: camposContato.whatsapp.optional(),
    ativo: camposContato.ativo.optional(),
  })
  .strict()
  .refine((c) => Object.keys(c).length > 0, { message: 'informe ao menos um campo', path: ['_'] });

export type NovoContato = z.infer<typeof novoContatoSchema>;
export type AlterarContato = z.infer<typeof alterarContatoSchema>;
