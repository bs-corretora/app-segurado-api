import { z } from 'zod';
import { cpfValido } from '@/lib/validacao/cpf';
import { nomeCompletoValido, normalizarNome, telefoneValido } from '@/lib/validacao/campos';
import { hojeSaoPaulo } from '@/lib/datas';

// Schemas das rotas de autenticação e conta (seção 6.3). Ficam fora dos route.ts porque
// também alimentam o OpenAPI.

const email = z
  .string({ error: 'e-mail obrigatório' })
  .trim()
  .toLowerCase()
  .pipe(z.email('e-mail inválido'));

const telefone = z
  .string()
  .trim()
  .regex(/^\d{10,11}$/, 'telefone deve ter 10 ou 11 dígitos, só números')
  .refine(telefoneValido, 'telefone inválido: confira o DDD e o número');

const nomeCompleto = z
  .string({ error: 'nome obrigatório' })
  .transform(normalizarNome)
  .refine(nomeCompletoValido, 'informe nome e sobrenome, só letras (3 a 120 caracteres)');

/** 8 a 72 caracteres, com ao menos uma letra e um número. */
const senhaForte = (campo: string) =>
  z
    .string({ error: `${campo} obrigatória` })
    .min(8, 'senha deve ter no mínimo 8 caracteres')
    .max(72, 'senha deve ter no máximo 72 caracteres')
    .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), 'senha deve ter ao menos uma letra e um número');

export const loginSchema = z.object({
  email,
  senha: z.string({ error: 'senha obrigatória' }).min(1, 'senha obrigatória'),
});

export const esqueciSenhaSchema = z.object({ email });

/** Reenvio do código de confirmação (#71): só o e-mail, como no esqueci a senha. */
export const reenviarCodigoSchema = z.object({ email });

/** Confirmação de e-mail (#71): o código de 6 dígitos que chegou por e-mail. */
export const confirmarEmailSchema = z.object({
  email,
  codigo: z
    .string({ error: 'código obrigatório' })
    .trim()
    .regex(/^\d{6}$/, 'o código tem 6 dígitos'),
});

const novaSenha = senhaForte('nova_senha');

export const trocarSenhaSchema = z
  .object({
    senha_atual: z.string({ error: 'senha_atual obrigatória' }).min(1, 'senha_atual obrigatória'),
    nova_senha: novaSenha,
  })
  .refine((d) => d.senha_atual !== d.nova_senha, {
    path: ['nova_senha'],
    message: 'a nova senha deve ser diferente da atual',
  });

export const redefinirSenhaSchema = z.object({ nova_senha: novaSenha });

/**
 * Idade completa em anos (datas AAAA-MM-DD). A referência é o dia de hoje em São Paulo, não o
 * relógio do servidor, que roda em UTC.
 */
export function idade(nascimento: string, hoje = hojeSaoPaulo()) {
  const [a, m, d] = nascimento.split('-').map(Number);
  const [ha, hm, hd] = hoje.split('-').map(Number);
  let anos = ha - a;
  if (hm < m || (hm === m && hd < d)) anos--;
  return anos;
}

export const cadastroSchema = z.object({
  nome: nomeCompleto,
  cpf: z
    .string({ error: 'CPF obrigatório' })
    .transform((v) => v.replace(/\D/g, ''))
    .refine(cpfValido, 'CPF inválido'),
  email,
  telefone,
  data_nascimento: z.iso
    .date('data_nascimento deve estar no formato AAAA-MM-DD')
    .refine((d) => idade(d) >= 18, 'é preciso ter 18 anos ou mais')
    .refine((d) => idade(d) <= 120, 'data_nascimento inválida'),
  senha: senhaForte('senha'),
  numero_apolice: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(AU|RE|VI|EM)-\d{4}-\d{6}$/, 'número de apólice inválido')
    .optional(),
  aceite_termos: z.literal(true, { error: 'é preciso aceitar os termos de uso' }),
  // Consentimento de marketing é opt-in: sem o campo, fica falso.
  aceita_marketing: z.boolean({ error: 'aceita_marketing deve ser true ou false' }).optional().default(false),
});

export const atualizarMeSchema = z
  .object({
    telefone: telefone.nullable().optional(),
    aceita_marketing: z.boolean().optional(),
  })
  .strict()
  .refine((d) => Object.keys(d).length > 0, 'informe telefone ou aceita_marketing');
