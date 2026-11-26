import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirSinistroSchema } from '@/lib/schemas/sinistro';
import { cotacaoSchema, indicadoSchema, codigoIndicacaoSchema } from '@/lib/schemas/escrita';
import { contatosQuerySchema, notificacoesQuerySchema, idSchema } from '@/lib/schemas/app';
import { statusSinistroSchema, sinistrosFiltroSchema, respostaCotacaoSchema } from '@/lib/schemas/admin';
import { dispositivoSchema, campanhaSchema } from '@/lib/schemas/push';
import { aniversarioHoje, hojeSaoPaulo, iniciais, tempoDeCasa } from '@/lib/datas';

const APOLICE = '6f1c1111-1111-1111-1111-111111111111';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-17T12:00:00-03:00'));
});
afterEach(() => vi.useRealTimers());

describe('RF-03 sinistro', () => {
  const ok = {
    apolice_id: APOLICE,
    tipo: 'COLISAO',
    data_ocorrencia: '2026-11-10T14:30:00-03:00',
    descricao: 'Batida leve no estacionamento',
  };

  it('RF-03: aceita abertura válida e transforma texto vazio em undefined', () => {
    const r = abrirSinistroSchema.parse({ ...ok, local: '  ', descricao: 'Batida leve' });
    expect(r.local).toBeUndefined();
    expect(r.descricao).toBe('Batida leve');
  });
  it('RF-03: recusa data_ocorrencia no futuro', () => {
    const r = abrirSinistroSchema.safeParse({ ...ok, data_ocorrencia: '2026-11-17T13:00:00-03:00' });
    expect(r.success).toBe(false);
  });
  it('RF-03: aceita data_ocorrencia exatamente agora', () => {
    expect(abrirSinistroSchema.safeParse({ ...ok, data_ocorrencia: '2026-11-17T12:00:00-03:00' }).success).toBe(true);
  });
  it('RF-03: recusa data sem fuso', () => {
    expect(abrirSinistroSchema.safeParse({ ...ok, data_ocorrencia: '2026-11-10T14:30:00' }).success).toBe(false);
  });
  it('RF-03: recusa tipo de sinistro inválido', () => {
    expect(abrirSinistroSchema.safeParse({ ...ok, tipo: 'ALAGAMENTO' }).success).toBe(false);
  });
  it('RF-03: recusa apolice_id que não é uuid', () => {
    expect(abrirSinistroSchema.safeParse({ ...ok, apolice_id: '123' }).success).toBe(false);
  });
  it('RF-03: descrição é obrigatória, com 10 a 2000 caracteres após o trim', () => {
    const semDescricao: Record<string, unknown> = { ...ok };
    delete semDescricao.descricao;
    expect(abrirSinistroSchema.safeParse(semDescricao).success).toBe(false);
    expect(abrirSinistroSchema.safeParse({ ...ok, descricao: '   curta   ' }).success).toBe(false);
    expect(abrirSinistroSchema.safeParse({ ...ok, descricao: ' '.repeat(12) }).success).toBe(false);
    expect(abrirSinistroSchema.safeParse({ ...ok, descricao: '1234567890' }).success).toBe(true);
    expect(abrirSinistroSchema.safeParse({ ...ok, descricao: 'a'.repeat(2000) }).success).toBe(true);
  });
  it('RF-03: recusa data_ocorrencia com mais de 1 ano (prescrição)', () => {
    const r = abrirSinistroSchema.safeParse({ ...ok, data_ocorrencia: '2025-11-16T11:59:00-03:00' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('prescreveu');
  });
  it('RF-03: aceita data_ocorrencia no limite de 1 ano', () => {
    expect(abrirSinistroSchema.safeParse({ ...ok, data_ocorrencia: '2025-11-17T12:00:00-03:00' }).success).toBe(true);
  });
  it('RF-03: recusa descrição com mais de 2000 caracteres', () => {
    expect(abrirSinistroSchema.safeParse({ ...ok, descricao: 'a'.repeat(2001) }).success).toBe(false);
  });
  it('RF-03: status do sinistro só anda para a frente (ABERTO não é destino)', () => {
    const c = 'ok';
    expect(statusSinistroSchema.safeParse({ status: 'ABERTO', comentario: c }).success).toBe(false);
    expect(statusSinistroSchema.safeParse({ status: 'EM_ANALISE', comentario: c }).success).toBe(true);
    expect(statusSinistroSchema.safeParse({ status: 'CONCLUIDO', comentario: c }).success).toBe(true);
  });
  it('RF-03: mudança de status exige comentário', () => {
    expect(statusSinistroSchema.safeParse({ status: 'CONCLUIDO', comentario: '  ' }).success).toBe(false);
  });
  it('RF-03: filtro de status recusa valor fora do domínio', () => {
    expect(sinistrosFiltroSchema.safeParse({ status: 'ARQUIVADO' }).success).toBe(false);
    expect(sinistrosFiltroSchema.safeParse({}).success).toBe(true);
  });
});

describe('RF-04 cotação', () => {
  it('RF-04: aceita cotação válida sem dados', () => {
    expect(cotacaoSchema.safeParse({ produto: 'AUTO', motivo: 'NOVO' }).success).toBe(true);
  });
  it('RF-04: recusa produto inválido', () => {
    expect(cotacaoSchema.safeParse({ produto: 'PET', motivo: 'NOVO' }).success).toBe(false);
  });
  it('RF-04: recusa motivo inválido', () => {
    expect(cotacaoSchema.safeParse({ produto: 'AUTO', motivo: 'CANCELAMENTO' }).success).toBe(false);
  });
  it('RF-04: aceita dados com exatamente 30 campos', () => {
    const dados = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`c${i}`, i]));
    expect(cotacaoSchema.safeParse({ produto: 'VIDA', motivo: 'NOVO', dados }).success).toBe(true);
  });
  it('RF-04: recusa dados com mais de 30 campos', () => {
    const dados = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`c${i}`, i]));
    expect(cotacaoSchema.safeParse({ produto: 'VIDA', motivo: 'NOVO', dados }).success).toBe(false);
  });
  it('RF-04: recusa dados com valor aninhado', () => {
    expect(cotacaoSchema.safeParse({ produto: 'AUTO', motivo: 'NOVO', dados: { a: { b: 1 } } }).success).toBe(false);
  });
  it('RF-04: recusa dados acima de 4 KB', () => {
    const dados = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`c${i}`, 'x'.repeat(500)]));
    expect(cotacaoSchema.safeParse({ produto: 'AUTO', motivo: 'NOVO', dados }).success).toBe(false);
  });
});

describe('RF-04 cotação: valores dos dados', () => {
  const dados = (d: Record<string, unknown>) => cotacaoSchema.safeParse({ produto: 'AUTO', motivo: 'NOVO', dados: d });
  it('RF-04: aceita números de 0 a 9999999999 e faz trim nos textos', () => {
    expect(dados({ valor: 0, max: 9_999_999_999 }).success).toBe(true);
    const r = cotacaoSchema.parse({ produto: 'AUTO', motivo: 'NOVO', dados: { modelo: '  Onix  ' } });
    expect(r.dados?.modelo).toBe('Onix');
  });
  it('RF-04: recusa número negativo, grande demais ou infinito', () => {
    expect(dados({ valor: -1 }).success).toBe(false);
    expect(dados({ valor: 10_000_000_000 }).success).toBe(false);
    expect(dados({ valor: Infinity }).success).toBe(false);
    expect(dados({ valor: NaN }).success).toBe(false);
  });
  it('RF-04: recusa texto vazio ou só de espaços', () => {
    expect(dados({ modelo: '   ' }).success).toBe(false);
    expect(dados({ modelo: '' }).success).toBe(false);
  });
});

describe('RF-05 indicação', () => {
  it('RF-05: grava só dígitos do telefone e e-mail em minúsculas', () => {
    const r = indicadoSchema.parse({ nome: 'João', telefone: '(11) 98765-4321', email: 'JOAO@X.COM' });
    expect(r.telefone).toBe('11987654321');
    expect(r.email).toBe('joao@x.com');
  });
  it('RF-05: e-mail vazio vira ausente', () => {
    expect(indicadoSchema.parse({ nome: 'João', telefone: '1133334444', email: '' }).email).toBeUndefined();
  });
  it('RF-05: nome do indicado só com letras, aceita uma palavra, hífen e apóstrofo', () => {
    const t = '11987654321';
    expect(indicadoSchema.parse({ nome: '  Ana   Maria  ', telefone: t }).nome).toBe('Ana Maria');
    expect(indicadoSchema.safeParse({ nome: "D'Ávila-Lima", telefone: t }).success).toBe(true);
    expect(indicadoSchema.safeParse({ nome: 'João', telefone: t }).success).toBe(true);
    expect(indicadoSchema.safeParse({ nome: 'João 2', telefone: t }).success).toBe(false);
    expect(indicadoSchema.safeParse({ nome: '<b>x</b>', telefone: t }).success).toBe(false);
    expect(indicadoSchema.safeParse({ nome: 'João-', telefone: t }).success).toBe(false);
  });
  it('RF-05: telefone do indicado exige DDD oficial, celular com 9 e fixo com 2 a 5', () => {
    const nome = 'João Lima';
    expect(indicadoSchema.safeParse({ nome, telefone: '(10) 98765-4321' }).success).toBe(false);
    expect(indicadoSchema.safeParse({ nome, telefone: '11887654321' }).success).toBe(false);
    expect(indicadoSchema.safeParse({ nome, telefone: '1198765432' }).success).toBe(false);
    expect(indicadoSchema.safeParse({ nome, telefone: '1133334444' }).success).toBe(true);
  });
  it('RF-05: recusa telefone sem DDD e nome curto', () => {
    expect(indicadoSchema.safeParse({ nome: 'João', telefone: '987654321' }).success).toBe(false);
    expect(indicadoSchema.safeParse({ nome: 'J', telefone: '11987654321' }).success).toBe(false);
  });
  it('RF-05: código de indicação tem 3 a 12 alfanuméricos', () => {
    expect(codigoIndicacaoSchema.safeParse('ABC123').success).toBe(true);
    expect(codigoIndicacaoSchema.safeParse('AB').success).toBe(false);
    expect(codigoIndicacaoSchema.safeParse('ABC-123').success).toBe(false);
    expect(codigoIndicacaoSchema.safeParse('A'.repeat(13)).success).toBe(false);
  });
});

describe('RF-02 contatos e RF-06 notificações', () => {
  it('RF-02: contatos exige tipo válido', () => {
    expect(contatosQuerySchema.safeParse({ tipo: 'SINISTRO' }).success).toBe(true);
    expect(contatosQuerySchema.safeParse({ tipo: 'OUTRO' }).success).toBe(false);
    expect(contatosQuerySchema.safeParse({}).success).toBe(false);
  });
  it('RF-06: nao_lidas vira booleano, ausente = false', () => {
    expect(notificacoesQuerySchema.parse({ nao_lidas: 'true' }).nao_lidas).toBe(true);
    expect(notificacoesQuerySchema.parse({}).nao_lidas).toBe(false);
    expect(notificacoesQuerySchema.safeParse({ nao_lidas: 'talvez' }).success).toBe(false);
  });
  it('RF-06: dispositivo exige token Expo e plataforma válida', () => {
    expect(dispositivoSchema.safeParse({ push_token: 'ExponentPushToken[abc]', plataforma: 'IOS' }).success).toBe(true);
    expect(dispositivoSchema.safeParse({ push_token: 'abc', plataforma: 'IOS' }).success).toBe(false);
    expect(dispositivoSchema.safeParse({ push_token: 'ExpoPushToken[abc]', plataforma: 'WEB' }).success).toBe(false);
  });
  it('RF-06: campanha exige título e mensagem dentro do limite', () => {
    expect(campanhaSchema.safeParse({ titulo: 'Oi', mensagem: 'Texto' }).success).toBe(true);
    expect(campanhaSchema.safeParse({ titulo: '', mensagem: 'Texto' }).success).toBe(false);
    expect(campanhaSchema.safeParse({ titulo: 'Oi', mensagem: 'a'.repeat(501) }).success).toBe(false);
    expect(campanhaSchema.safeParse({ titulo: 'Oi', mensagem: 'x', produto: 'PET' }).success).toBe(false);
  });
  it('RF-01: idSchema aceita uuid do seed e recusa lixo', () => {
    expect(idSchema.safeParse(APOLICE).success).toBe(true);
    expect(idSchema.safeParse('abc').success).toBe(false);
  });
});

describe('RF-07 tempo de casa', () => {
  it('RF-07: calcula anos e meses completos', () => {
    expect(tempoDeCasa('2023-07-17', '2026-11-17')).toEqual({ anos: 3, meses: 4 });
  });
  it('RF-07: mês incompleto não conta', () => {
    expect(tempoDeCasa('2023-07-18', '2026-11-17')).toEqual({ anos: 3, meses: 3 });
  });
  it('RF-07: data futura devolve zero', () => {
    expect(tempoDeCasa('2027-01-01', '2026-11-17')).toEqual({ anos: 0, meses: 0 });
  });
  it('RF-07: usa a data de hoje em São Paulo por padrão', () => {
    vi.setSystemTime(new Date('2026-11-18T01:30:00Z')); // ainda 17/11 em SP
    expect(hojeSaoPaulo()).toBe('2026-11-17');
    expect(tempoDeCasa('2026-10-17')).toEqual({ anos: 0, meses: 1 });
  });
  it('RF-07: iniciais do nome', () => {
    expect(iniciais('Maria Souza')).toBe('MS');
    expect(iniciais('fernanda')).toBe('F');
    expect(iniciais('  ')).toBe('');
  });
});

describe('RF-08 aniversário', () => {
  it('RF-08: é aniversário quando dia e mês batem', () => {
    expect(aniversarioHoje('1990-11-17', '2026-11-17')).toBe(true);
    expect(aniversarioHoje('1990-11-18', '2026-11-17')).toBe(false);
  });
  it('RF-08: nascido em 29/02 comemora em 28/02 em ano não bissexto', () => {
    expect(aniversarioHoje('1992-02-29', '2027-02-28')).toBe(true);
    expect(aniversarioHoje('1992-02-29', '2027-03-01')).toBe(false);
  });
  it('RF-08: nascido em 29/02 comemora em 29/02 em ano bissexto, não em 28/02', () => {
    expect(aniversarioHoje('1992-02-29', '2028-02-29')).toBe(true);
    expect(aniversarioHoje('1992-02-29', '2028-02-28')).toBe(false);
  });
});

describe('RF-10 resposta de cotação (admin)', () => {
  it('RF-10: valor_estimado precisa ser positivo e respeitar o teto', () => {
    const r = (valor_estimado?: number) => respostaCotacaoSchema.safeParse({ resposta: 'ok', valor_estimado });
    expect(r().success).toBe(true);
    expect(r(0).success).toBe(false);
    expect(r(-5).success).toBe(false);
    expect(r(0.01).success).toBe(true);
    expect(r(9_999_999_999.99).success).toBe(true);
    expect(r(10_000_000_000).success).toBe(false);
  });
});
