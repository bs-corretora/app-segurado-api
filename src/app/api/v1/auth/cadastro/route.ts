import { type NextRequest } from 'next/server';
import { supabaseAuth } from '@/lib/supabase/server';
import { ok, erro, erroValidacao } from '@/lib/api-response';
import { gravarSessao } from '@/lib/security/cookies';
import { ipDe, limitar } from '@/lib/security/rate-limit';
import { cadastroSchema } from '@/lib/schemas/conta';
import { cadastrar } from '@/lib/services/cadastro';

// POST /api/v1/auth/cadastro — pública (seção 6.3). Rate limit: 3/min por IP (7.2).
// Cria conta e perfil, vincula apólices e já inicia a sessão.
export async function POST(req: NextRequest) {
  const bloqueio = await limitar('cadastro', ipDe(req));
  if (bloqueio) return bloqueio;

  const corpo = await req.json().catch(() => null);
  if (corpo === null) return erro(400, 'VALIDACAO', 'corpo da requisição deve ser um JSON válido');

  const entrada = cadastroSchema.safeParse(corpo);
  if (!entrada.success) return erroValidacao(entrada.error);

  try {
    const resultado = await cadastrar(entrada.data);
    if (!resultado.ok) {
      if (resultado.motivo === 'APOLICE_NAO_CONFERE') {
        return erro(400, 'VALIDACAO', 'numero_apolice inválido', {
          campos: { numero_apolice: 'apólice não encontrada para este CPF' },
        });
      }
      if (resultado.motivo === 'CONFLITO') {
        // Genérica de propósito: não revela se foi o CPF ou o e-mail (seção 6.3).
        return erro(409, 'CONFLITO', 'Não foi possível concluir o cadastro com esses dados');
      }
      return erro(503, 'INDISPONIVEL', 'Não foi possível concluir o cadastro agora');
    }

    const { data } = await supabaseAuth().auth.signInWithPassword({
      email: entrada.data.email,
      password: entrada.data.senha,
    });
    const resposta = ok(
      { id: resultado.perfil_id, apolices_vinculadas: resultado.apolices_vinculadas },
      201,
    );
    // Se o login automático falhar, a conta existe: o app manda para o login.
    return data.session ? gravarSessao(resposta, data.session) : resposta;
  } catch (e) {
    console.error('[cadastro]', e);
    return erro(503, 'INDISPONIVEL', 'Não foi possível concluir o cadastro agora');
  }
}
