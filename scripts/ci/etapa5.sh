#!/usr/bin/env bash
# Teste ponta a ponta da Etapa 5 (rotas de administração). Roda no CI depois do etapa6.sh,
# contra o Supabase local e a API em http://127.0.0.1:3000. Conta notificações e eventos por
# destino/título, porque os outros scripts também criam notificações.
set -euo pipefail

API=http://127.0.0.1:3000/api/v1
export PGPASSWORD=postgres
sql() { psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAq -v ON_ERROR_STOP=1 -c "$1"; }

DIR=$(mktemp -d)
falhas=0

confere() {
  if [ "$2" = "$3" ]; then
    echo "ok    $1"
  else
    echo "FALHA $1: esperado '$2', veio '$3'"
    falhas=$((falhas + 1))
  fi
}

# req <jar> <método> <rota> [corpo] → imprime o status; corpo da resposta em $DIR/r.json
req() {
  local jar=$1 metodo=$2 rota=$3 corpo=${4:-}
  local args=(-s -o "$DIR/r.json" -w '%{http_code}' -X "$metodo" -b "$DIR/$jar" -c "$DIR/$jar")
  [ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")
  curl "${args[@]}" "$API$rota"
}

# js <expressão sobre r> → avalia na última resposta
js() { node -e "const r=require('$DIR/r.json'); console.log($1)"; }

# Cota própria no limite de login (5/min por IP): o ipDe lê o último X-Forwarded-For.
login() {
  local status
  status=$(curl -s -o "$DIR/r.json" -w '%{http_code}' -X POST -c "$DIR/$1" \
    -H 'Content-Type: application/json' -H 'X-Forwarded-For: 10.0.0.5' \
    -d "{\"email\":\"$2\",\"senha\":\"Senha@123\"}" "$API/auth/login")
  confere "login $1" 200 "$status"
}

login admin admin@bsseguros.com.br
login maria maria.souza@email.com

MARIA=22222222-2222-2222-2222-222222222222
CARLOS=55555555-5555-5555-5555-555555555555
SIN_MARIA=a7d21111-1111-1111-1111-111111111111
COT_CARLOS=c31e2222-2222-2222-2222-222222222222
INEXISTENTE=00000000-0000-0000-0000-000000000000

echo '--- permissão'
confere 'sem sessão → 401' 401 "$(req anonimo GET /admin/segurados)"
for rota in /admin/segurados "/admin/segurados/$MARIA" /admin/sinistros /admin/cotacoes /admin/indicacoes /admin/contatos; do
  confere "segurado em GET $rota → 403" 403 "$(req maria GET "$rota")"
done
confere 'segurado muda status de sinistro → 403' 403 "$(req maria PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"CONCLUIDO","comentario":"x"}')"
confere 'segurado responde cotação → 403' 403 "$(req maria PATCH "/admin/cotacoes/$COT_CARLOS/resposta" '{"resposta":"x"}')"
confere 'segurado cria contato → 403' 403 "$(req maria POST /admin/contatos '{"tipo":"SINISTRO","rotulo":"x","telefone":"08000000000"}')"
confere 'nada mudou no sinistro da Maria' EM_ANALISE "$(sql "SELECT status FROM sinistro WHERE id = '$SIN_MARIA'")"

echo '--- segurados'
confere 'lista sem busca → 200' 200 "$(req admin GET /admin/segurados)"
confere 'lista tem os 5 segurados (admin fica fora)' 5 "$(js r.total)"
confere 'busca por nome (maiúsculas) → Maria' "Maria Souza" "$(req admin GET '/admin/segurados?busca=MARIA' >/dev/null; js 'r.itens.map(i=>i.nome).join()')"
confere 'busca devolve o e-mail' maria.souza@email.com "$(js 'r.itens[0].email')"
confere 'busca por CPF com pontuação → Maria' "Maria Souza" "$(req admin GET '/admin/segurados?busca=529.482.200' >/dev/null; js 'r.itens.map(i=>i.nome).join()')"
confere 'busca por e-mail → João' "João Silva" "$(req admin GET '/admin/segurados?busca=joao.silva%40' >/dev/null; js 'r.itens.map(i=>i.nome).join()')"
confere 'busca não acha o admin' 0 "$(req admin GET '/admin/segurados?busca=bsseguros' >/dev/null; js r.total)"
confere '"%" na busca não vira curinga' 0 "$(req admin GET '/admin/segurados?busca=%25' >/dev/null; js r.total)"
confere 'paginação limite=2' 2 "$(req admin GET '/admin/segurados?limite=2' >/dev/null; js r.itens.length)"
confere 'limite=99 → 400' 400 "$(req admin GET '/admin/segurados?limite=99')"
confere 'detalhe da Maria → 200' 200 "$(req admin GET "/admin/segurados/$MARIA")"
confere 'detalhe traz e-mail e 3 apólices' "maria.souza@email.com 3" "$(js "r.email+' '+r.apolices.length")"
confere 'detalhe do admin → 404' 404 "$(req admin GET /admin/segurados/11111111-1111-1111-1111-111111111111)"
confere 'detalhe inexistente → 404' 404 "$(req admin GET "/admin/segurados/$INEXISTENTE")"
confere 'detalhe com id inválido → 404' 404 "$(req admin GET /admin/segurados/abc)"

echo '--- sinistros'
confere 'filtro de status inválido → 400' 400 "$(req admin GET '/admin/sinistros?status=PERDIDO')"
confere 'filtro CONCLUIDO → 200' 200 "$(req admin GET '/admin/sinistros?status=CONCLUIDO')"
confere 'filtro CONCLUIDO só traz concluídos' true "$(js "r.itens.length>0 && r.itens.every(i=>i.status==='CONCLUIDO')")"
confere 'lista traz nome do segurado e número da apólice' true "$(req admin GET /admin/sinistros >/dev/null; js "r.itens.every(i=>i.segurado.nome && i.apolice.numero)")"
confere 'voltar para ABERTO → 400 (não é aceito)' 400 "$(req admin PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"ABERTO","comentario":"x"}')"
confere 'sem comentário → 400' 400 "$(req admin PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"CONCLUIDO","comentario":"  "}')"
confere 'mesmo status (EM_ANALISE) → 409' 409 "$(req admin PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"EM_ANALISE","comentario":"de novo"}')"
confere 'sinistro inexistente → 404' 404 "$(req admin PATCH "/admin/sinistros/$INEXISTENTE/status" '{"status":"CONCLUIDO","comentario":"x"}')"
notif_antes=$(sql "SELECT count(*) FROM notificacao WHERE perfil_id = '$MARIA' AND destino_tipo = 'SINISTRO' AND destino_id = '$SIN_MARIA'")
confere 'EM_ANALISE → CONCLUIDO → 200' 200 "$(req admin PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"CONCLUIDO","comentario":"Indenização aprovada (CI)."}')"
confere 'resposta traz o novo status' CONCLUIDO "$(js r.status)"
confere 'evento gravado com o admin como autor' 1 "$(sql "SELECT count(*) FROM sinistro_evento WHERE sinistro_id = '$SIN_MARIA' AND status = 'CONCLUIDO' AND autor_id = '11111111-1111-1111-1111-111111111111' AND comentario = 'Indenização aprovada (CI).'")"
confere 'Maria recebeu a notificação do sinistro' "$((notif_antes + 1))" "$(sql "SELECT count(*) FROM notificacao WHERE perfil_id = '$MARIA' AND destino_tipo = 'SINISTRO' AND destino_id = '$SIN_MARIA'")"
confere 'notificação nova diz "foi concluído"' 'SIN-2026-000123 foi concluído.' "$(sql "SELECT mensagem FROM notificacao WHERE destino_id = '$SIN_MARIA' ORDER BY criado_em DESC LIMIT 1")"
confere 'Maria vê o evento no app (detalhe do sinistro)' 200 "$(req maria GET "/sinistros/$SIN_MARIA")"
confere 'linha do tempo do app termina em CONCLUIDO' CONCLUIDO "$(js 'r.eventos.at(-1).status')"
confere 'concluído de novo → 409' 409 "$(req admin PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"CONCLUIDO","comentario":"x"}')"
confere 'concluído para EM_ANALISE → 409' 409 "$(req admin PATCH "/admin/sinistros/$SIN_MARIA/status" '{"status":"EM_ANALISE","comentario":"x"}')"
confere '409 não gravou evento' 1 "$(sql "SELECT count(*) FROM sinistro_evento WHERE sinistro_id = '$SIN_MARIA' AND status = 'CONCLUIDO'")"

echo '--- cotações'
confere 'filtro RECEBIDA → 200' 200 "$(req admin GET '/admin/cotacoes?status=RECEBIDA')"
confere 'cotação do Carlos aparece como RECEBIDA' true "$(js "r.itens.some(i=>i.id==='$COT_CARLOS' && i.segurado.nome==='Carlos Pereira')")"
confere 'valor negativo → 400' 400 "$(req admin PATCH "/admin/cotacoes/$COT_CARLOS/resposta" '{"resposta":"x","valor_estimado":-1}')"
confere 'sem resposta → 400' 400 "$(req admin PATCH "/admin/cotacoes/$COT_CARLOS/resposta" '{"valor_estimado":10}')"
confere 'cotação inexistente → 404' 404 "$(req admin PATCH "/admin/cotacoes/$INEXISTENTE/resposta" '{"resposta":"x"}')"
notif_antes=$(sql "SELECT count(*) FROM notificacao WHERE perfil_id = '$CARLOS' AND destino_tipo = 'COTACAO' AND destino_id = '$COT_CARLOS'")
confere 'responder → 200' 200 "$(req admin PATCH "/admin/cotacoes/$COT_CARLOS/resposta" '{"resposta":"Renovação com 10% de desconto.","valor_estimado":2150.5}')"
confere 'cotação RESPONDIDA com valor e data' 'RESPONDIDA|2150.50|true' "$(sql "SELECT status || '|' || valor_estimado || '|' || (respondida_em IS NOT NULL) FROM cotacao WHERE id = '$COT_CARLOS'")"
confere 'Carlos recebeu a notificação da cotação' "$((notif_antes + 1))" "$(sql "SELECT count(*) FROM notificacao WHERE perfil_id = '$CARLOS' AND destino_tipo = 'COTACAO' AND destino_id = '$COT_CARLOS'")"
confere 'responder de novo → 409' 409 "$(req admin PATCH "/admin/cotacoes/$COT_CARLOS/resposta" '{"resposta":"outra"}')"
confere '409 não trocou a resposta' 'Renovação com 10% de desconto.' "$(sql "SELECT resposta FROM cotacao WHERE id = '$COT_CARLOS'")"

echo '--- indicações'
LUCAS=$(sql "SELECT id FROM indicacao WHERE nome = 'Lucas Mendes'")
PAULA=$(sql "SELECT id FROM indicacao WHERE nome = 'Paula Ramos'")
confere 'filtro NOVA traz o Lucas' true "$(req admin GET '/admin/indicacoes?status=NOVA' >/dev/null; js "r.itens.some(i=>i.id==='$LUCAS' && i.indicador.nome==='Maria Souza')")"
confere 'status NOVA no PATCH → 400' 400 "$(req admin PATCH "/admin/indicacoes/$PAULA/status" '{"status":"NOVA"}')"
confere 'NOVA → CONTATADA → 200' 200 "$(req admin PATCH "/admin/indicacoes/$LUCAS/status" '{"status":"CONTATADA"}')"
confere 'CONTATADA de novo → 409' 409 "$(req admin PATCH "/admin/indicacoes/$LUCAS/status" '{"status":"CONTATADA"}')"
confere 'CONTATADA → CONVERTIDA (Paula) → 200' 200 "$(req admin PATCH "/admin/indicacoes/$PAULA/status" '{"status":"CONVERTIDA"}')"
confere 'CONVERTIDA para CONTATADA → 409' 409 "$(req admin PATCH "/admin/indicacoes/$PAULA/status" '{"status":"CONTATADA"}')"
confere 'indicação inexistente → 404' 404 "$(req admin PATCH "/admin/indicacoes/$INEXISTENTE/status" '{"status":"CONTATADA"}')"
confere 'status gravados no banco' 'CONTATADA CONVERTIDA' "$(sql "SELECT (SELECT status FROM indicacao WHERE id = '$LUCAS') || ' ' || (SELECT status FROM indicacao WHERE id = '$PAULA')")"

echo '--- contatos'
confere 'lista → 200' 200 "$(req admin GET /admin/contatos)"
confere 'lista traz os 5 do seed' true "$(js 'r.itens.length>=5')"
confere 'filtro de tipo inválido → 400' 400 "$(req admin GET '/admin/contatos?tipo=EMAIL')"
confere 'sem telefone e sem WhatsApp → 400' 400 "$(req admin POST /admin/contatos '{"tipo":"ASSISTENCIA_24H","produto":"AUTO","rotulo":"Guincho CI"}')"
confere 'telefone com letra → 400' 400 "$(req admin POST /admin/contatos '{"tipo":"ASSISTENCIA_24H","produto":"AUTO","rotulo":"Guincho CI","telefone":"0800-GUINCHO"}')"
confere 'cria contato → 201' 201 "$(req admin POST /admin/contatos '{"tipo":"ASSISTENCIA_24H","produto":"AUTO","rotulo":"Guincho CI","telefone":"08007005000"}')"
CONTATO=$(js r.id)
confere 'contato novo nasce ativo' true "$(js r.ativo)"
confere 'Maria (tem AUTO) vê o contato novo no app' true "$(req maria GET '/contatos?tipo=ASSISTENCIA_24H' >/dev/null; js "r.itens.some(i=>i.rotulo==='Guincho CI')")"
confere 'PATCH vazio → 400' 400 "$(req admin PATCH "/admin/contatos/$CONTATO" '{}')"
confere 'PATCH com campo desconhecido → 400' 400 "$(req admin PATCH "/admin/contatos/$CONTATO" '{"cor":"azul"}')"
confere 'PATCH tirando o único canal → 400' 400 "$(req admin PATCH "/admin/contatos/$CONTATO" '{"telefone":null}')"
confere 'desativa → 200' 200 "$(req admin PATCH "/admin/contatos/$CONTATO" '{"ativo":false}')"
confere 'desativado continua na lista do admin' false "$(req admin GET /admin/contatos >/dev/null; js "r.itens.find(i=>i.id==='$CONTATO').ativo")"
confere 'Maria não vê mais o contato desativado' false "$(req maria GET '/contatos?tipo=ASSISTENCIA_24H' >/dev/null; js "r.itens.some(i=>i.rotulo==='Guincho CI')")"
confere 'troca telefone por WhatsApp → 200' 200 "$(req admin PATCH "/admin/contatos/$CONTATO" '{"telefone":null,"whatsapp":"5581900009999"}')"
confere 'banco ficou só com WhatsApp' '|5581900009999' "$(sql "SELECT coalesce(telefone, '') || '|' || whatsapp FROM contato_assistencia WHERE id = '$CONTATO'")"
confere 'PATCH em contato inexistente → 404' 404 "$(req admin PATCH "/admin/contatos/$INEXISTENTE" '{"ativo":false}')"

echo '--- permissões no banco'
for f in "admin_buscar_segurados(NULL, 10, 0)" "admin_email_do_segurado('$MARIA')" \
  "admin_alterar_status_sinistro('$SIN_MARIA', 'CONCLUIDO', 'x', NULL)" \
  "admin_responder_cotacao('$COT_CARLOS', 'x', NULL)" "admin_alterar_status_indicacao('$LUCAS', 'CONVERTIDA')"; do
  for papel in anon authenticated; do
    if psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAq -c "SET ROLE $papel; SELECT * FROM public.$f" >/dev/null 2>&1; then
      confere "$papel não executa $f" negado executou
    else
      confere "$papel não executa $f" negado negado
    fi
  done
done

echo
if [ "$falhas" -gt 0 ]; then
  echo "$falhas verificação(ões) falharam"
  exit 1
fi
echo 'Etapa 5: tudo certo'
