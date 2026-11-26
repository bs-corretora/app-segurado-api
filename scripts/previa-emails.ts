/**
 * Prévia dos e-mails transacionais (#71, #72): grava cada modelo em tmp/emails/ (fora do git)
 * para abrir no navegador. Dados de exemplo do seed; nada é enviado.
 *
 * Uso: npm run emails:previa
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  codigoConfirmacao,
  cotacaoRespondida,
  redefinirSenha,
  statusSinistro,
  type Mensagem,
} from '../src/lib/email/modelos';

const destino = join(process.cwd(), 'tmp', 'emails');
mkdirSync(destino, { recursive: true });

const exemplos: [string, Mensagem][] = [
  ['1-codigo-confirmacao', codigoConfirmacao({ codigo: '482915', nome: 'Paulo Lima' })],
  [
    '2-redefinir-senha',
    redefinirSenha({
      link: 'https://exemplo.supabase.co/auth/v1/verify?token=pkce_exemplo&type=recovery&redirect_to=https://app-segurado-api.onrender.com/redefinir-senha',
      nome: 'Maria Souza',
    }),
  ],
  [
    '3-sinistro-em-analise',
    statusSinistro({
      protocolo: 'SIN-2026-000123',
      status: 'EM_ANALISE',
      comentario: 'Documentação recebida e encaminhada para perícia.\nA vistoria do veículo fica para quinta-feira, às 10h.',
      nome: 'Maria Souza',
    }),
  ],
  [
    '4-sinistro-concluido',
    statusSinistro({
      protocolo: 'SIN-2026-000124',
      status: 'CONCLUIDO',
      comentario: 'Indenização aprovada. O pagamento cai em até 5 dias úteis.',
      nome: 'Carlos Pereira',
    }),
  ],
  [
    '5-cotacao-respondida',
    cotacaoRespondida({
      produto: 'RESIDENCIAL',
      resposta: 'Plano básico a partir de R$ 39,90/mês, com cobertura para incêndio, roubo e danos elétricos.',
      valor: 478.8,
      nome: 'Maria Souza',
    }),
  ],
];

for (const [nome, m] of exemplos) {
  writeFileSync(join(destino, `${nome}.html`), m.html);
  writeFileSync(join(destino, `${nome}.txt`), `Assunto: ${m.assunto}\n\n${m.texto}\n`);
  console.log(`${nome}: ${m.assunto}`);
}
console.log(`\nAbra no navegador: ${destino}`);
