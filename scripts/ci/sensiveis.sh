#!/usr/bin/env bash
# Acesso a dado de outro usuário (#64): cada rota do app que recebe id, e cada lista, só devolve
# o que é da pessoa logada. Complementa o que etapa4, etapa6 e fechamento já cobrem (sinistro criado
# no teste, cotação e aparelho). Roda no CI, contra o Supabase local e a API em http://127.0.0.1:3000.
set -euo pipefail

BASE=http://127.0.0.1:3000
API=$BASE/api/v1
# Cota própria no limite de login (por IP): cada roteiro usa um IP só dele.
IP=10.0.0.30
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

req() {
  local jar=$1 metodo=$2 rota=$3 corpo=${4:-}
  local args=(-s -o "$DIR/r.json" -w '%{http_code}' -X "$metodo" -b "$DIR/$jar" -c "$DIR/$jar" -H "X-Forwarded-For: $IP")
  [ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")
  curl "${args[@]}" "$API$rota"
}

js() { node -e "const r=require('$DIR/r.json'); console.log($1)"; }

MARIA=22222222-2222-2222-2222-222222222222
JOAO=33333333-3333-3333-3333-333333333333
APOLICE_MARIA=6f1c1111-1111-1111-1111-111111111111
APOLICE_JOAO=6f1c3333-3333-3333-3333-333333333333
NOTIF_MARIA=9e441111-1111-1111-1111-111111111111
SINISTRO_MARIA=a7d21111-1111-1111-1111-111111111111
COTACAO_MARIA=c31e1111-1111-1111-1111-111111111111

confere 'login maria' 200 "$(req maria POST /auth/login '{"email":"maria.souza@email.com","senha":"Senha@123"}')"
confere 'login joao' 200 "$(req joao POST /auth/login '{"email":"joao.silva@email.com","senha":"Senha@123"}')"

echo '--- apólices'
confere 'Maria vê a apólice dela → 200' 200 "$(req maria GET "/apolices/$APOLICE_MARIA")"
confere 'João não vê a apólice da Maria → 404' 404 "$(req joao GET "/apolices/$APOLICE_MARIA")"
confere 'João não pede o PDF da apólice da Maria → 404' 404 "$(req joao GET "/apolices/$APOLICE_MARIA/pdf")"
confere 'id malformado → 404' 404 "$(req joao GET /apolices/abc)"
confere 'lista do João não traz apólice da Maria' 0 "$(req joao GET /apolices >/dev/null; js "r.itens.filter(a => a.id === '$APOLICE_MARIA').length")"
confere 'lista da Maria não traz apólice do João' 0 "$(req maria GET /apolices >/dev/null; js "r.itens.filter(a => a.id === '$APOLICE_JOAO').length")"

echo '--- sinistros e cotações do seed'
confere 'João não vê o sinistro do seed da Maria → 404' 404 "$(req joao GET "/sinistros/$SINISTRO_MARIA")"
confere 'lista de sinistros do João sem o da Maria' 0 "$(req joao GET /sinistros >/dev/null; js "r.itens.filter(s => s.id === '$SINISTRO_MARIA').length")"
confere 'João não vê a cotação do seed da Maria → 404' 404 "$(req joao GET "/cotacoes/$COTACAO_MARIA")"
confere 'lista de cotações do João sem a da Maria' 0 "$(req joao GET /cotacoes >/dev/null; js "r.itens.filter(c => c.id === '$COTACAO_MARIA').length")"

echo '--- notificações'
antes=$(sql "SELECT COALESCE(lida_em::text, 'nunca') FROM notificacao WHERE id = '$NOTIF_MARIA'")
confere 'João não marca a notificação da Maria como lida → 404' 404 "$(req joao PATCH "/notificacoes/$NOTIF_MARIA/lida")"
confere 'a notificação da Maria segue como estava' "$antes" "$(sql "SELECT COALESCE(lida_em::text, 'nunca') FROM notificacao WHERE id = '$NOTIF_MARIA'")"
confere 'lista de notificações do João sem a da Maria' 0 "$(req joao GET /notificacoes >/dev/null; js "r.itens.filter(n => n.id === '$NOTIF_MARIA').length")"

echo '--- indicações e perfil'
confere 'lista de indicações do João não traz as da Maria' false "$(req joao GET /indicacoes >/dev/null; js "JSON.stringify(r).includes('Lucas Mendes')")"
confere '/me devolve o perfil de quem está logado' "$JOAO" "$(req joao GET /me >/dev/null; js 'r.id')"

echo '--- painel e anônimo'
confere 'segurado nas rotas do painel → 403' 403 "$(req joao GET /admin/segurados)"
confere 'segurado no detalhe de outro pelo painel → 403' 403 "$(req joao GET "/admin/segurados/$MARIA")"
confere 'anônimo nas rotas do app → 401' 401 "$(curl -s -o /dev/null -w '%{http_code}' -H "X-Forwarded-For: $IP" "$API/apolices")"

echo
if [ "$falhas" -gt 0 ]; then
  echo "$falhas verificação(ões) falharam"
  exit 1
fi
echo 'Dados sensíveis: tudo certo'
