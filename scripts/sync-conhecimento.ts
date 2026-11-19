#!/usr/bin/env node
/**
 * Script idempotente para sincronizar arquivos Markdown da pasta supabase/conhecimento
 * para a tabela public.conhecimento.
 * 
 * Uso: npm run conhecimento
 * Registrado no package.json como script "conhecimento".
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

const CONHECIMENTO_DIR = join(__dirname, '..', 'supabase', 'conhecimento');

// Mapeamento de arquivo -> categoria
const CATEGORIA_POR_ARQUIVO: Record<string, string> = {
  'sinistro-abrir.md': 'SINISTRO',
  'apolices-consultar.md': 'APOLICE',
  'cotacao-solicitar.md': 'COTACAO',
  'indicacao-amigo.md': 'APP_USO',
  'notificacoes-gerenciar.md': 'APP_USO',
  'conta-criar-entrar.md': 'CONTA',
  'conta-senha.md': 'CONTA',
  'instalacao-pwa.md': 'APP_USO',
};

function extrairTitulo(conteudo: string): string {
  const match = conteudo.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Sem título';
}

async function main() {
  // Carrega variáveis de ambiente
  const supabaseUrl = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY não configurada');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('🔄 Sincronizando base de conhecimento...');

  const arquivos = readdirSync(CONHECIMENTO_DIR).filter(f => extname(f) === '.md');
  
  if (arquivos.length === 0) {
    console.log('⚠️  Nenhum arquivo .md encontrado em supabase/conhecimento/');
    return;
  }

  let inseridos = 0;
  let atualizados = 0;

  for (const arquivo of arquivos) {
    const caminho = join(CONHECIMENTO_DIR, arquivo);
    const conteudo = readFileSync(caminho, 'utf-8');
    const titulo = extrairTitulo(conteudo);
    // Guarda só o corpo, sem a linha '# Título' (igual ao supabase/seed.sql)
    const corpo = conteudo
      .replace(/\r/g, '')
      .replace(/^#\s+.+\n+/, '')
      .trim();
    const categoria = CATEGORIA_POR_ARQUIVO[arquivo] || 'GERAL';

    // Verifica se já existe pelo slug (busca por título similar)
    const { data: existente } = await supabase
      .from('conhecimento')
      .select('id, titulo')
      .ilike('titulo', `%${titulo}%`)
      .maybeSingle();

    if (existente) {
      // Atualiza
      const { error } = await supabase
        .from('conhecimento')
        .update({ conteudo: corpo, categoria, atualizado_em: new Date().toISOString() })
        .eq('id', existente.id);
      
      if (error) {
        console.error(`❌ Erro ao atualizar "${titulo}":`, error.message);
      } else {
        console.log(`🔄 Atualizado: ${titulo}`);
        atualizados++;
      }
    } else {
      // Insere
      const { error } = await supabase
        .from('conhecimento')
        .insert({ titulo, conteudo: corpo, categoria });
      
      if (error) {
        console.error(`❌ Erro ao inserir "${titulo}":`, error.message);
      } else {
        console.log(`✅ Inserido: ${titulo}`);
        inseridos++;
      }
    }
  }

  console.log(`\n✨ Concluído: ${inseridos} inseridos, ${atualizados} atualizados`);
}

main().catch(console.error);