import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cadastroSchema,
  loginSchema,
  trocarSenhaSchema,
  redefinirSenhaSchema,
  atualizarMeSchema,
  idade,
} from '@/lib/schemas/conta';
import { nomeCompletoValido, telefoneValido } from '@/lib/validacao/campos';
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
  it('AUTH: idade usa o dia de São Paulo, não o relógio UTC do servidor', () => {
    // 18/11 01:00 UTC ainda é 17/11 22:00 em São Paulo: quem nasceu em 18/11/2008 ainda tem 17.
    vi.setSystemTime(new Date('2026-11-18T01:00:00Z'));
    expect(idade('2008-11-18')).toBe(17);
    expect(cadastroSchema.safeParse({ ...base, data_nascimento: '2008-11-18' }).success).toBe(false);
    expect(idade('2008-11-17')).toBe(18);
  });
  it('AUTH: idade aceita a data de hoje por parâmetro', () => {
    expect(idade('2000-01-01', '2026-01-01')).toBe(26);
    expect(idade('2000-01-02', '2026-01-01')).toBe(25);
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
  it('AUTH: recusa idade acima de 120 anos', () => {
    expect(cadastroSchema.safeParse({ ...base, data_nascimento: '1905-11-17' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, data_nascimento: '1905-11-18' }).success).toBe(true);
  });
  it('AUTH: recusa data de nascimento fora do formato', () => {
    expect(cadastroSchema.safeParse({ ...base, data_nascimento: '20/05/1990' }).success).toBe(false);
  });
  it('AUTH: recusa senha com menos de 8 caracteres', () => {
    expect(cadastroSchema.safeParse({ ...base, senha: '1234567' }).success).toBe(false);
  });
  it('AUTH: senha exige letra e número, de 8 a 72 caracteres', () => {
    expect(cadastroSchema.safeParse({ ...base, senha: 'somenteletras' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, senha: '1234567890' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, senha: 'abcdefg1' }).success).toBe(true);
    expect(cadastroSchema.safeParse({ ...base, senha: 'a'.repeat(71) + '1' }).success).toBe(true);
    expect(cadastroSchema.safeParse({ ...base, senha: 'a'.repeat(72) + '1' }).success).toBe(false);
  });
  it('AUTH: nome exige nome e sobrenome, só letras, e é normalizado', () => {
    expect(cadastroSchema.parse({ ...base, nome: '  Maria   da  Silva ' }).nome).toBe('Maria da Silva');
    expect(cadastroSchema.parse({ ...base, nome: "Joana D'Arc-Lima" }).nome).toBe("Joana D'Arc-Lima");
    expect(cadastroSchema.safeParse({ ...base, nome: 'Maria' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, nome: 'Maria 2ª' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, nome: 'Maria <script>' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, nome: 'M ' + 'a'.repeat(120) }).success).toBe(false);
  });
  it('AUTH: nome com acento decomposto (NFD) é normalizado para NFC', () => {
    expect(cadastroSchema.parse({ ...base, nome: 'Jose\u0301 Silva' }).nome).toBe('José Silva');
  });
  it('AUTH: aceita_marketing é opcional e, sem ele, fica false (LGPD)', () => {
    expect(cadastroSchema.parse(base).aceita_marketing).toBe(false);
    expect(cadastroSchema.parse({ ...base, aceita_marketing: true }).aceita_marketing).toBe(true);
    expect(cadastroSchema.safeParse({ ...base, aceita_marketing: 'sim' }).success).toBe(false);
  });
  it('AUTH: recusa telefone com DDD inexistente ou número fora do padrão', () => {
    expect(cadastroSchema.safeParse({ ...base, telefone: '10987654321' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, telefone: '11887654321' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, telefone: '1198765432' }).success).toBe(false);
    expect(cadastroSchema.safeParse({ ...base, telefone: '1133334444' }).success).toBe(true);
  });
  it('AUTH: atualizar perfil também valida o telefone', () => {
    expect(atualizarMeSchema.safeParse({ telefone: '00987654321' }).success).toBe(false);
    expect(atualizarMeSchema.safeParse({ telefone: '81988881111' }).success).toBe(true);
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
    expect(trocarSenhaSchema.safeParse({ senha_atual: 'abcdefg1', nova_senha: 'abcdefg1' }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ senha_atual: 'abcdefg1', nova_senha: 'abcdefg12' }).success).toBe(true);
  });
  it('AUTH: nova senha entre 8 e 72 caracteres', () => {
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'a'.repeat(7) }).success).toBe(false);
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'a'.repeat(71) + '1' }).success).toBe(true);
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'a'.repeat(72) + '1' }).success).toBe(false);
  });
  it('AUTH: nova senha exige letra e número (trocar e redefinir)', () => {
    expect(redefinirSenhaSchema.safeParse({ nova_senha: 'somenteletras' }).success).toBe(false);
    expect(redefinirSenhaSchema.safeParse({ nova_senha: '12345678' }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ senha_atual: 'x', nova_senha: 'somenteletras' }).success).toBe(false);
    expect(trocarSenhaSchema.safeParse({ senha_atual: 'x', nova_senha: 'letras123' }).success).toBe(true);
  });
  it('AUTH: atualizar perfil recusa corpo vazio e campo desconhecido', () => {
    expect(atualizarMeSchema.safeParse({}).success).toBe(false);
    expect(atualizarMeSchema.safeParse({ papel: 'ADMIN' }).success).toBe(false);
    expect(atualizarMeSchema.safeParse({ aceita_marketing: true }).success).toBe(true);
    expect(atualizarMeSchema.safeParse({ telefone: null }).success).toBe(true);
  });
});

describe('AUTH: validadores de campo', () => {
  it('AUTH: telefoneValido segue DDD da Anatel, celular com 9 e fixo com 2 a 5', () => {
    expect(telefoneValido('11987654321')).toBe(true);
    expect(telefoneValido('8133334444')).toBe(true);
    expect(telefoneValido('8163334444')).toBe(false);
    expect(telefoneValido('81233334444')).toBe(false);
    expect(telefoneValido('20987654321')).toBe(false);
    expect(telefoneValido('119876543')).toBe(false);
    expect(telefoneValido('11a87654321')).toBe(false);
  });
  it('AUTH: nomeCompletoValido exige duas palavras só com letras', () => {
    expect(nomeCompletoValido('Ana Lima')).toBe(true);
    expect(nomeCompletoValido('Ana')).toBe(false);
    expect(nomeCompletoValido("Ana D'Ávila")).toBe(true);
    expect(nomeCompletoValido("Ana 'Lima")).toBe(false);
    expect(nomeCompletoValido('Ana  Lima')).toBe(false);
  });
});
