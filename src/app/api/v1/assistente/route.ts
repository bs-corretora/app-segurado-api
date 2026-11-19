import { NextRequest } from 'next/server';
import { z } from 'zod';
import { exigirSessao } from '@/lib/security/sessao';
import { ok, erro, falhaBanco } from '@/lib/api-response';
import { processarAssistente } from '@/lib/services/assistente';

// Schema de validação da entrada (contrato Issue #55)
const assistenteSchema = z.object({
  mensagens: z
    .array(
      z.object({
        papel: z.enum(['usuario', 'assistente']),
        texto: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(10),
});

// POST /api/v1/assistente
// Recebe histórico recente (últimas 10 mensagens) e devolve resposta do assistente com fontes e atalhos
export async function POST(req: NextRequest) {
  try {
    // 1. Autenticação e sessão (apenas SEGURADO) - Bearer token obrigatório
    const sessao = await exigirSessao(req, { papel: 'SEGURADO' });
    if (sessao instanceof Response) return sessao;

    // 2. Validação do corpo
    const body = await req.json();
    const parse = assistenteSchema.safeParse(body);
    if (!parse.success) {
      const campos: Record<string, string> = {};
      for (const issue of parse.error.issues) {
        const chave = issue.path.join('.') || '_';
        campos[chave] ??= issue.message;
      }
      return erro(400, 'VALIDACAO', 'Entrada inválida', { campos });
    }

    const { mensagens } = parse.data;

    // 3. Garante que a última mensagem seja do usuário (requisição atual)
    const ultimaMsg = mensagens[mensagens.length - 1];
    if (ultimaMsg.papel !== 'usuario') {
      return erro(400, 'VALIDACAO', 'A última mensagem deve ser do usuário');
    }

    // 4. Converte para formato interno (role/content) e processa
    const mensagensInternas = mensagens.map((m) => ({
      role: m.papel === 'usuario' ? 'user' as const : 'assistant' as const,
      content: m.texto,
    }));

    // 5. Processa com o assistente (passa perfil_id da sessão autenticada)
    const resultado = await processarAssistente(mensagensInternas, sessao.perfil_id);

    // 6. Retorna resposta estruturada (sem logar conteúdo das mensagens - LGPD)
    console.log('[assistente] resposta gerada para perfil', sessao.perfil_id);
    return ok(resultado);
  } catch (e) {
    return falhaBanco('POST /api/v1/assistente', e);
  }
}