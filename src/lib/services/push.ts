import { createHash, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { Campanha, Dispositivo } from '@/lib/schemas/push';

// Etapa 6 (seções 5.4, 6.9 e 6.10): dispositivos, campanhas e envio do push pelo Expo.

/** Registra o token do aparelho. Token que já existia muda de dono (outro login no mesmo aparelho). */
export async function registrarDispositivo(perfilId: string, d: Dispositivo) {
  const { data, error } = await supabaseAdmin()
    .from('dispositivo')
    .upsert(
      {
        perfil_id: perfilId,
        push_token: d.push_token,
        plataforma: d.plataforma,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'push_token' },
    )
    .select('id, push_token, plataforma, atualizado_em')
    .single();
  if (error) throw error;
  return data;
}

/** Remove o token no logout. false = não existe ou é de outro perfil (a rota responde 404). */
export async function removerDispositivo(perfilId: string, token: string) {
  const { data, error } = await supabaseAdmin()
    .from('dispositivo')
    .delete()
    .eq('perfil_id', perfilId)
    .eq('push_token', token)
    .select('id');
  if (error) throw error;
  return data.length > 0;
}

/** Cria a notificação MARKETING de quem aceita marketing (filtro opcional por produto). */
export async function enviarCampanha(c: Campanha): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('enviar_campanha', {
    p_titulo: c.titulo,
    p_mensagem: c.mensagem,
    p_produto: c.produto ?? null,
  });
  if (error) throw error;
  return data as number;
}

/** Compara a chave sem vazar o tamanho nem a posição do primeiro caractere diferente. */
export function chaveInternaValida(recebida: string | null): boolean {
  const esperada = getEnv().INTERNAL_API_KEY;
  if (!esperada || !recebida) return false;
  const a = createHash('sha256').update(recebida).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}

type Pendente = {
  id: string;
  perfil_id: string;
  titulo: string;
  mensagem: string;
  destino_tipo: string | null;
  destino_id: string | null;
};

type Ticket = { status: 'ok' | 'error'; details?: { error?: string } };

type Mensagem = { notificacao_id: string; to: string; title: string; body: string; data: object };

/** O Expo aceita no máximo 100 mensagens por requisição. */
const LOTE_EXPO = 100;

/**
 * Envia o push das notificações com push_enviado_em nulo.
 *
 * 1. Reserva as pendentes no banco (já marca push_enviado_em; SKIP LOCKED evita envio em dobro).
 * 2. Uma mensagem por aparelho do perfil. Perfil sem aparelho fica só na central in-app.
 * 3. Lote que falhou no Expo (rede, 5xx): as notificações dele voltam para a fila.
 * 4. Ticket DeviceNotRegistered: o app foi desinstalado, o token é apagado.
 */
export async function enviarPushPendentes(limite = 500) {
  const db = supabaseAdmin();

  const reservadas = await db.rpc('reservar_push_pendentes', { p_limite: limite });
  if (reservadas.error) throw reservadas.error;
  const pendentes = (reservadas.data ?? []) as Pendente[];

  const resultado = {
    processadas: pendentes.length,
    mensagens: 0,
    sem_aparelho: 0,
    devolvidas: 0,
    tokens_removidos: 0,
  };
  if (pendentes.length === 0) return resultado;

  const perfis = [...new Set(pendentes.map((p) => p.perfil_id))];
  const aparelhos = await db
    .from('dispositivo')
    .select('perfil_id, push_token')
    .in('perfil_id', perfis);
  if (aparelhos.error) {
    await db.rpc('liberar_push', { p_ids: pendentes.map((p) => p.id) });
    throw aparelhos.error;
  }

  const tokensPorPerfil = new Map<string, string[]>();
  for (const a of aparelhos.data) {
    tokensPorPerfil.set(a.perfil_id, [...(tokensPorPerfil.get(a.perfil_id) ?? []), a.push_token]);
  }

  const mensagens: Mensagem[] = [];
  for (const n of pendentes) {
    const tokens = tokensPorPerfil.get(n.perfil_id) ?? [];
    if (tokens.length === 0) resultado.sem_aparelho++;
    for (const to of tokens) {
      mensagens.push({
        notificacao_id: n.id,
        to,
        title: n.titulo,
        body: n.mensagem,
        data: { notificacao_id: n.id, destino_tipo: n.destino_tipo, destino_id: n.destino_id },
      });
    }
  }

  const devolver = new Set<string>();
  const tokensMortos = new Set<string>();
  const { EXPO_PUSH_URL } = getEnv();

  for (let i = 0; i < mensagens.length; i += LOTE_EXPO) {
    const lote = mensagens.slice(i, i + LOTE_EXPO);
    try {
      const r = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          lote.map(({ to, title, body, data }) => ({ to, title, body, data, sound: 'default' })),
        ),
        signal: AbortSignal.timeout(10_000),
      });
      if (!r.ok) throw new Error(`Expo Push respondeu ${r.status}`);
      const tickets = ((await r.json()) as { data?: Ticket[] }).data ?? [];
      lote.forEach((m, k) => {
        const t = tickets[k];
        if (t?.status === 'ok') resultado.mensagens++;
        else if (t?.details?.error === 'DeviceNotRegistered') tokensMortos.add(m.to);
      });
    } catch (e) {
      console.error('[push] lote falhou, volta para a fila:', e instanceof Error ? e.message : e);
      for (const m of lote) devolver.add(m.notificacao_id);
    }
  }

  if (devolver.size > 0) {
    const r = await db.rpc('liberar_push', { p_ids: [...devolver] });
    if (r.error) throw r.error;
    resultado.devolvidas = devolver.size;
  }
  if (tokensMortos.size > 0) {
    const r = await db.from('dispositivo').delete().in('push_token', [...tokensMortos]);
    if (r.error) throw r.error;
    resultado.tokens_removidos = tokensMortos.size;
  }
  return resultado;
}
