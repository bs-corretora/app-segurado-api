import { z } from 'zod';
import { cpfValido } from '@/lib/validacao/cpf';

// Schemas das rotas de autenticação e conta (seção 6.3). Ficam fora dos
// route.ts porque também alimentam o OpenAPI.

const email = z
  .string({ error: 'e-mail obrigatório' })
  .trim()
  .toLowerCase()
  .pipe(z.email('e-mail inválido'));

const telefone = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, 'telefone deve ter 10 ou 11 dígitos, só números');

export const loginSchema = z.object({
  email,
  senha: z.string({ error: 'senha obrigatória' }).min(1, 'senha obrigatória'),
});

export const esqueciSenhaSchema = z.object({ email });

/** Idade completa em anos numa data de referência (hoje, por padrão). */
export function idade(nascimento: string, hoje = new Date()) {
  const [a, m, d] = nascimento.split('-').map(Number);
  let anos = hoje.getFullYear() - a;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) anos--;
  return anos;
}

export const cadastroSchema = z.object({
  nome: z.string({ error: 'nome obrigatório' }).trim().min(3, 'nome muito curto').max(120),
  cpf: z
    .string({ error: 'CPF obrigatório' })
    .transform((v) => v.replace(/\D/g, ''))
    .refine(cpfValido, 'CPF inválido'),
  email,
  telefone,
  data_nascimento: z.iso
    .date('data_nascimento deve estar no formato AAAA-MM-DD')
    .refine((d) => idade(d) >= 18, 'é preciso ter 18 anos ou mais'),
  senha: z.string({ error: 'senha obrigatória' }).min(8, 'senha deve ter no mínimo 8 caracteres'),
  numero_apolice: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(AU|RE|VI|EM)-\d{4}-\d{6}$/, 'número de apólice inválido')
    .optional(),
  aceite_termos: z.literal(true, { error: 'é preciso aceitar os termos de uso' }),
});

export const atualizarMeSchema = z
  .object({
    telefone: telefone.nullable().optional(),
    aceita_marketing: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe telefone ou aceita_marketing');
