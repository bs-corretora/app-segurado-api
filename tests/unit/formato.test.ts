import { describe, expect, it, vi } from 'vitest';
import {
  caminhoSeguro,
  descreverErro,
  formatarCpf,
  formatarTelefone,
  mascararCpf,
  redigir,
} from '@/lib/formato';
import { falhaBanco } from '@/lib/api-response';

describe('RNF-05: formatação e máscara de dados pessoais (#62)', () => {
  it('formata o CPF completo', () => {
    expect(formatarCpf('99887766593')).toBe('998.877.665-93');
    expect(formatarCpf('998.877.665-93')).toBe('998.877.665-93');
  });

  it('mascara o CPF mostrando só o miolo', () => {
    expect(mascararCpf('99887766593')).toBe('***.877.665-**');
    expect(mascararCpf('998.877.665-93')).toBe('***.877.665-**');
  });

  it('CPF com tamanho errado não vaza dígito na máscara', () => {
    expect(mascararCpf('123')).toBe('***.***.***-**');
    expect(formatarCpf('123')).toBe('123');
  });

  it('CPF vazio vira travessão', () => {
    expect(formatarCpf(null)).toBe('—');
    expect(mascararCpf(undefined)).toBe('—');
    expect(formatarCpf('')).toBe('—');
  });

  it('formata celular e fixo', () => {
    expect(formatarTelefone('81998765432')).toBe('(81) 99876-5432');
    expect(formatarTelefone('8133334444')).toBe('(81) 3333-4444');
    expect(formatarTelefone('(81) 99876-5432')).toBe('(81) 99876-5432');
  });

  it('telefone fora do padrão fica como veio; vazio vira travessão', () => {
    expect(formatarTelefone('+55 81 99876-5432 ramal 2')).toBe('+55 81 99876-5432 ramal 2');
    expect(formatarTelefone('12345')).toBe('12345');
    expect(formatarTelefone(null)).toBe('—');
  });
});

describe('RNF-05: logs sem dado pessoal (#64)', () => {
  it('redige CPF, e-mail e telefone em texto', () => {
    const texto = redigir(
      'Key (cpf)=(99887766593) já existe; maria.souza@email.com; 998.877.665-93; (81) 99876-5432; 81998765432',
    );
    expect(texto).not.toMatch(/99887766593|maria|998\.877|99876|81998765432/);
    expect(texto).toContain('[cpf]');
    expect(texto).toContain('[email]');
    expect(texto).toContain('[telefone]');
  });

  it('não mexe em UUID nem em número curto', () => {
    const id = '6f1c3333-3333-3333-3333-333333333333';
    expect(redigir(`apolice ${id} falhou em 250ms`)).toBe(`apolice ${id} falhou em 250ms`);
  });

  it('descreve erro do Supabase sem o valor da chave duplicada', () => {
    const e = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "perfil_cpf_key"',
      details: 'Key (cpf)=(99887766593) already exists.',
      hint: null,
    };
    const texto = descreverErro(e);
    expect(texto).toContain('23505');
    expect(texto).toContain('perfil_cpf_key');
    expect(texto).not.toContain('99887766593');
  });

  it('descreve Error comum sem e-mail', () => {
    expect(descreverErro(new Error('falha para joao.silva@email.com'))).not.toContain('joao.silva');
  });

  it('falhaBanco registra o erro redigido e responde 503', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = falhaBanco('teste', { message: 'x', details: 'Key (cpf)=(99887766593)' });
    expect(r.status).toBe(503);
    expect(JSON.stringify(espiao.mock.calls)).not.toContain('99887766593');
    espiao.mockRestore();
  });

  it('o token do aparelho não aparece no caminho do log', () => {
    expect(caminhoSeguro('/api/v1/dispositivos/ExponentPushToken[abc123]')).toBe(
      '/api/v1/dispositivos/:token',
    );
    expect(caminhoSeguro('/api/v1/sinistros')).toBe('/api/v1/sinistros');
  });
});
