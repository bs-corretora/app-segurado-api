import { z } from 'zod';

// Schemas da Etapa 6: dispositivos (seção 6.9) e campanhas (seção 6.10).

/** Token do Expo Push: ExponentPushToken[...] ou ExpoPushToken[...]. Mesmo limite da coluna. */
export const pushTokenSchema = z
  .string()
  .trim()
  .max(255, 'push_token com no máximo 255 caracteres')
  .regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'push_token deve ser um token do Expo Push');

export const dispositivoSchema = z.object({
  push_token: pushTokenSchema,
  plataforma: z.enum(['ANDROID', 'IOS'], { error: 'plataforma deve ser ANDROID ou IOS' }),
});

export type Dispositivo = z.infer<typeof dispositivoSchema>;

/** Mesmo domínio do CHECK `check_apolice_produto`. */
export const PRODUTOS = ['AUTO', 'RESIDENCIAL', 'VIDA', 'EMPRESARIAL'] as const;

export const campanhaSchema = z.object({
  // 120 = tamanho de notificacao.titulo.
  titulo: z.string().trim().min(1, 'titulo obrigatório').max(120, 'titulo com no máximo 120 caracteres'),
  mensagem: z
    .string()
    .trim()
    .min(1, 'mensagem obrigatória')
    .max(500, 'mensagem com no máximo 500 caracteres'),
  // Sem produto: todos os segurados que aceitam marketing.
  produto: z.enum(PRODUTOS, { error: `produto deve ser um de: ${PRODUTOS.join(', ')}` }).optional(),
});

export type Campanha = z.infer<typeof campanhaSchema>;
