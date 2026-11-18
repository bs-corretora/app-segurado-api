import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cadastroSchema,
  loginSchema,
  trocarSenhaSchema,
  redefinirSenhaSchema,
  atualizarMeSchema,
  idade,
} from '@/lib/schemas/conta';
import { cpfValido } from '@/lib/validacao/cpf';

const base = {
  nome: 'Maria Souza',
  cpf: '529.982.247-25',
  email: ' Maria@Exemplo.com ',
  telefone: '11987654321',
  data_nascimento: '1990-05-20',
  senha: 'senha-forte-1',
  aceite_termos: true,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T12:00:00-03:00'));
});
afterEach(() => vi.useRealTimers());

describe('AUTH: cpf', () => {
  it('AUTH: aceita CPF válido', () => expect(cpfValido('52998224725')).toBe(true));
  it('AUTH: recusa CPF com dígito verificador errado', () => expect(cpfValido('52998224724')).toBe(false));
  it('AUTH: recusa CPF com todos os dígitos iguais', () => expect(cpfValido('11111111111')).toBe(false));
  it('AUTH: recusa CPF com tamanho errado ou letras', () => {
    expect(cpfValido('123')).toBe(false);
    expect(cpfValido('5299822472a')).toBe(false);
  });
});

describe('AUTH: idade', () => {
  it('AUTH: idade completa só depois do aniversário', () => {
    expect(idade('2000-11-17')).toBe(26);
    expect(idade('2000-11-18')).toBe(25);
    expect(idade('2000-12-01')).toBe(25);
  });
});

describe('AUTH: cadastro', () => {
  it('AUTH: aceita cadastro válido, normaliza CPF e e-mail', () => {
    const r = cadastroSchema.parse(base);
    expect(r.cpf).toBe('52998224725');
    expect(r.email).toBe('maria@exemplo.com');
  });
  it('AUTH: recusa CPF inválido', () => {
    const r = cadastroSchema.safeParse({ ...base, cpf: '111.111.111-11' });
    expect(r.success).toBe(false);
  });
  it('AUTH: recusa menor de 18 anos', () => {
    const r = cadastroSchema.safeParse({ ...base, data_nascimento: '2008-11-18' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('18 anos');
  });
  it('AUTH: aceita quem faz 18 anos hoje', () => {
    expect(cadastroSchema.safeParse({ ...base, data_nascimento: '2008-11-17' }).success).toBe(true);
  });
  it('AUTH: recusa data de nascimento fora do formato', () => {
    expect(cadastroSchema.safeParse({ ...base, data_nascimento: '20/05/1990' }).success).toBe(false);
  });
  it('AUTH: recusa senha com menos de 8 caracteres', () => {
    expect(cadastroSchema.safeParse({ ...base, senha: '1234567' }).success).toBe(false);
  });
  it('AUTH: recusa quando não aceita os termos', () => {
    expect(cadastroSchema.safeParse({ ...base, aceite_termos: false }).success).toBe(false);
  });
  it('AUTH: recusa telefone com máscara ou tamanho errado', () => {
    expect(cadastroSchema.safeParse({ ...base, telefone: '(11) 98765-4321' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, telefone: '119876' }).success).toBe(false);
  });
  it('AUTH: número de apólice em minúsculas é normalizado; formato errado é recusado', () => {
    expect(cadastroSchema.parse({ ...base, numero_apolice: 'au-2026-000123' }).numero_apolice).toBe('AU-2026-000123');
    expect(cadastroSchema.safeParse({ ...base, numero_apolice: 'XX-2026-000123' }).success).toBe(false);
  });
});

describe('AUTH: login e senhas', () => {
  it('AUTH: login recusa e-mail inválido e senha vazia', () => {
    expect(loginSchema.safeParse({ email: 'nao-e-email', senha: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', senha: '' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'a@b.com', senha: 'x' }).success).toBe(true);
  });
  it('AUTH: trocar senha recusa nova igual à atual', () => {
    expect(trocarSenhaSchema.safeParse({ senha_atual: 'abcdefgh', nova_senha: 'abcdefgh' }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ senha_atual: 'abcdefgh', nova_senha: 'abcdefgh1' }).success).toBe(true);
  });
  it('AUTH: nova senha entre 8 e 72 caracteres', () => {
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'a'.repeat(7) }).success).toBe(false);
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'a'.repeat(72) }).success).toBe(true);
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'a'.repeat(73) }).success).toBe(false);
  });
  it('AUTH: atualizar perfil recusa corpo vazio e campo desconhecido', () => {
    expect(atualizarMeSchema.safeParse({}).success).toBe(false);
    expect(atualizarMeSchema.safeParse({ papel: 'ADMIN' }).success).toBe(false);
    expect(atualizarMeSchema.safeParse({ aceita_marketing: true }).success).toBe(true);
    expect(atualizarMeSchema.safeParse({ telefone: null }).success).toBe(true);
  });
});
