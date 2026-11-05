// Servidor falso do Expo Push para o teste da Etapa 6 no CI (nada aqui vai para produção).
//
//   POST /push      responde um ticket por mensagem: token com "Morto" vira DeviceNotRegistered.
//   POST /falhar    a partir daí, /push responde 503 (simula o Expo fora do ar).
//   POST /voltar    /push volta a funcionar.
//   GET  /recebidas quantas mensagens chegaram até agora.
import { createServer } from 'node:http';

let falhando = false;
let recebidas = 0;

function ler(req) {
  return new Promise((resolve) => {
    let corpo = '';
    req.on('data', (c) => (corpo += c));
    req.on('end', () => resolve(corpo));
  });
}

function responder(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(dados));
}

createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/falhar') return responder(res, 200, { falhando: (falhando = true) });
  if (req.method === 'POST' && req.url === '/voltar') return responder(res, 200, { falhando: (falhando = false) });
  if (req.method === 'GET' && req.url === '/recebidas') return responder(res, 200, { recebidas });
  if (req.method === 'POST' && req.url === '/push') {
    const mensagens = JSON.parse(await ler(req));
    if (falhando) return responder(res, 503, { erro: 'fora do ar' });
    recebidas += mensagens.length;
    return responder(res, 200, {
      data: mensagens.map((m) =>
        m.to.includes('Morto')
          ? { status: 'error', message: 'não registrado', details: { error: 'DeviceNotRegistered' } }
          : { status: 'ok', id: crypto.randomUUID() },
      ),
    });
  }
  responder(res, 404, {});
}).listen(4000, '127.0.0.1', () => console.log('expo falso em http://127.0.0.1:4000'));
