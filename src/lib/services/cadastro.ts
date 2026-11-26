import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase/server';
import { descreverErro } from '@/lib/formato';
import type { cadastroSchema } from '@/lib/schemas/conta';
import { enviarCodigoConfirmacao } from '@/lib/services/confirmacao-email';

type DadosCadastro = z.infer<typeof cadastroSchema>;

export type ResultadoCadastro =
  | { ok: true; perfil_id: string; apolices_vinculadas: number }
  | { ok: false; motivo: 'APOLICE_NAO_CONFERE' | 'CONFLITO' | 'FALHA' };

// Sem 0/O/1/I para o código não ser lido errado quando alguém dita o link.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function gerarCodigoIndicacao(tamanho = 8) {
  const bytes = randomBytes(tamanho);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/**
 * Cadastro público (seções 5.4 e 6.3):
 * 1. com número de apólice, confere se ela é do CPF informado e ainda não tem dono;
 * 2. cria o usuário no Auth com o e-mail AINDA NÃO confirmado (decisão 10 da especificação, #71);
 * 3. cria o perfil SEGURADO; se falhar, apaga o usuário do Auth para não sobrar conta órfã;
 * 4. vincula as apólices do titular e ajusta `cliente_desde` para a vigência mais antiga;
 * 5. manda o código de confirmação por e-mail. Se o envio falhar, a conta existe e o app oferece
 *    reenviar o código (POST /auth/reenviar-codigo).
 */
export async function cadastrar(dados: DadosCadastro): Promise<ResultadoCadastro> {
  const db = supabaseAdmin();

  let apolicesDoTitular: { id: string; inicio_vigencia: string }[] = [];
  if (dados.numero_apolice) {
    const { data, error } = await db
      .from('apolice')
      .select('id, numero, inicio_vigencia')
      .eq('cpf_titular', dados.cpf)
      .is('perfil_id', null);
    if (error) throw error;
    // O CPF sozinho não prova titularidade: o número informado precisa estar entre elas.
    if (!data.some((a) => a.numero === dados.numero_apolice)) {
      return { ok: false, motivo: 'APOLICE_NAO_CONFERE' };
    }
    apolicesDoTitular = data;
  }

  const { data: criado, error: erroAuth } = await db.auth.admin.createUser({
    email: dados.email,
    password: dados.senha,
    email_confirm: false,
  });
  if (erroAuth || !criado.user) {
    // E-mail já usado: mensagem genérica na rota (não diz qual dado conflitou).
    if (erroAuth?.status === 422 || erroAuth?.code === 'email_exists') {
      return { ok: false, motivo: 'CONFLITO' };
    }
    throw erroAuth ?? new Error('createUser não devolveu usuário');
  }
  const perfilId = criado.user.id;

  const clienteDesde = apolicesDoTitular.length
    ? apolicesDoTitular.map((a) => a.inicio_vigencia).sort()[0]
    : undefined; // sem vínculo, o default do banco (CURRENT_DATE)

  let erroPerfil: { code?: string } | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { error } = await db.from('perfil').insert({
      id: perfilId,
      cpf: dados.cpf,
      nome: dados.nome,
      telefone: dados.telefone,
      data_nascimento: dados.data_nascimento,
      aceita_marketing: dados.aceita_marketing,
      ...(clienteDesde ? { cliente_desde: clienteDesde } : {}),
      codigo_indicacao: gerarCodigoIndicacao(),
    });
    erroPerfil = error;
    // 23505 no código de indicação: sorteia outro. No CPF: conflito de verdade.
    if (!error || error.code !== '23505' || !error.message.includes('codigo_indicacao')) break;
  }

  if (erroPerfil) {
    await db.auth.admin.deleteUser(perfilId).catch(() => undefined);
    if (erroPerfil.code === '23505') return { ok: false, motivo: 'CONFLITO' };
    console.error('[cadastro] erro ao criar perfil:', descreverErro(erroPerfil));
    return { ok: false, motivo: 'FALHA' };
  }

  if (apolicesDoTitular.length) {
    const { error } = await db
      .from('apolice')
      .update({ perfil_id: perfilId })
      .in(
        'id',
        apolicesDoTitular.map((a) => a.id),
      );
    if (error) console.error('[cadastro] erro ao vincular apólices:', descreverErro(error));
  }

  await enviarCodigoConfirmacao(dados.email, dados.nome);

  return { ok: true, perfil_id: perfilId, apolices_vinculadas: apolicesDoTitular.length };
}
