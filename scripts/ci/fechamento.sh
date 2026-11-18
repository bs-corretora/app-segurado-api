#!/usr/bin/env bash
# Teste ponta a ponta do fechamento do back: sessão por Bearer (front em outro domínio), CORS com
# Authorization, refresh pelo corpo, detalhe de cotação, resumo do painel, troca e redefinição de
# senha. Roda no CI, contra o Supabase local e a API em http://127.0.0.1:3000. Roda por último:
# mexe na senha da Maria e devolve a original no fim.
set -euo pipefail

BASE=http://127.0.0.1:3000
API=$BASE/api/v1
export PGPASSWORD=postgres
sql() { psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAq -v ON_ERROR_STOP=1 -c "$1"; }
eval "$(supabase status -o env)"
SERVICE_KEY="${SERVICE_ROLE_KEY:-$SECRET_KEY}"

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

# Cada bloco usa um IP próprio: o limite de login e o de redefinição são por IP.
IP=10.0.0.20

# bearer <token|-> <metodo> <rota> [corpo] — sem cookie nenhum, como um front em outro domínio
bearer() {
  local token=$1 metodo=$2 rota=$3 corpo=${4:-}
  local args=(-s -o "$DIR/r.json" -w '%{http_code}' -X "$metodo" -H "X-Forwarded-For: $IP")
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")
  curl "${args[@]}" "$API$rota"
}

js() { node -e "const r=require('$DIR/r.json'); console.log($1)"; }

entrar() {
  confere "login $1" "${3:-200}" "$(bearer - POST /auth/login "{\"email\":\"$1\",\"senha\":\"$2\"}")"
}

MARIA_EMAIL=maria.souza@email.com
SENHA=Senha@123
NOVA=NovaSenha@456

echo '--- login devolve os tokens e o Bearer basta'
entrar $MARIA_EMAIL $SENHA
MARIA=$(js 'r.access_token')
REFRESH=$(js 'r.refresh_token')
confere 'login traz access_token' true "$(js 'typeof r.access_token === "string" && r.access_token.length > 20')"
confere 'login traz refresh_token' true "$(js 'typeof r.refresh_token === "string"')"
confere 'login traz expires_in' 3600 "$(js 'r.expires_in')"
confere 'GET /me só com Bearer → 200' 200 "$(bearer "$MARIA" GET /me)"
confere 'é a Maria' $MARIA_EMAIL "$(js 'r.email')"
confere 'Bearer inválido → 401' 401 "$(bearer 'nao-e-um-jwt' GET /me)"
confere 'sem nada → 401' 401 "$(bearer - GET /me)"
confere 'Bearer em rota de admin → 403' 403 "$(bearer "$MARIA" GET /admin/resumo)"

echo '--- CORS com Authorization'
pre=$(curl -s -o /dev/null -D "$DIR/h.txt" -w '%{http_code}' -X OPTIONS "$API/me" \
  -H 'Origin: http://localhost:3000' -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization')
confere 'preflight de origem permitida → 204' 204 "$pre"
confere 'preflight libera Authorization' 1 "$(grep -ci '^access-control-allow-headers:.*authorization' "$DIR/h.txt")"
confere 'preflight de origem estranha → 403' 403 "$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$API/me" -H 'Origin: https://outro.exemplo.com' -H 'Access-Control-Request-Method: GET')"

echo '--- refresh pelo corpo'
confere 'refresh com refresh_token no corpo → 200' 200 "$(bearer - POST /auth/refresh "{\"refresh_token\":\"$REFRESH\"}")"
NOVO_ACCESS=$(js 'r.access_token')
confere 'refresh devolve tokens novos' true "$(js 'r.renovada === true && typeof r.refresh_token === "string"')"
confere 'token renovado funciona' 200 "$(bearer "$NOVO_ACCESS" GET /dashboard)"
confere 'refresh inválido → 401' 401 "$(bearer - POST /auth/refresh '{"refresh_token":"invalido"}')"

echo '--- GET /cotacoes/{id}'
confere 'pedir cotação → 201' 201 "$(bearer "$MARIA" POST /cotacoes '{"produto":"VIDA","motivo":"NOVO"}')"
COT=$(js 'r.id')
confere 'detalhe → 200' 200 "$(bearer "$MARIA" GET "/cotacoes/$COT")"
confere 'detalhe é a mesma cotação' "$COT" "$(js 'r.id')"
confere 'detalhe nasce RECEBIDA' RECEBIDA "$(js 'r.status')"
confere 'id inexistente → 404' 404 "$(bearer "$MARIA" GET /cotacoes/00000000-0000-0000-0000-000000000000)"
confere 'id malformado → 404' 404 "$(bearer "$MARIA" GET /cotacoes/abc)"
IP=10.0.0.21
entrar joao.silva@email.com $SENHA
JOAO=$(js 'r.access_token')
confere 'cotação da Maria vista pelo João → 404' 404 "$(bearer "$JOAO" GET "/cotacoes/$COT")"

echo '--- GET /admin/resumo'
entrar admin@bsseguros.com.br $SENHA
ADMIN=$(js 'r.access_token')
confere 'resumo → 200' 200 "$(bearer "$ADMIN" GET /admin/resumo)"
confere 'segurados batem com o banco' "$(sql "SELECT count(*) FROM perfil WHERE papel = 'SEGURADO'")" "$(js 'r.segurados')"
confere 'cotações RECEBIDA batem com o banco' "$(sql "SELECT count(*) FROM cotacao WHERE status = 'RECEBIDA'")" "$(js 'r.cotacoes.RECEBIDA')"
confere 'sinistros abertos batem com o banco' "$(sql "SELECT count(*) FROM sinistro WHERE status = 'ABERTO'")" "$(js 'r.pendencias.sinistros_abertos')"

echo '--- PATCH /me/senha'
IP=10.0.0.22
confere 'senha atual errada → 400' 400 "$(bearer "$MARIA" PATCH /me/senha "{\"senha_atual\":\"errada123\",\"nova_senha\":\"$NOVA\"}")"
confere 'erro aponta senha_atual' 'senha atual incorreta' "$(js 'r.campos.senha_atual')"
confere 'nova igual à atual → 400' 400 "$(bearer "$MARIA" PATCH /me/senha "{\"senha_atual\":\"$SENHA\",\"nova_senha\":\"$SENHA\"}")"
confere 'nova curta → 400' 400 "$(bearer "$MARIA" PATCH /me/senha "{\"senha_atual\":\"$SENHA\",\"nova_senha\":\"123\"}")"
confere 'sem sessão → 401' 401 "$(bearer - PATCH /me/senha "{\"senha_atual\":\"$SENHA\",\"nova_senha\":\"$NOVA\"}")"
confere 'troca → 204' 204 "$(bearer "$MARIA" PATCH /me/senha "{\"senha_atual\":\"$SENHA\",\"nova_senha\":\"$NOVA\"}")"
confere 'sessão atual segue valendo' 200 "$(bearer "$MARIA" GET /me)"
IP=10.0.0.23
entrar $MARIA_EMAIL $SENHA 401
entrar $MARIA_EMAIL $NOVA

echo '--- redefinição pelo link do e-mail'
IP=10.0.0.24
confere 'esqueci-senha → 204' 204 "$(bearer - POST /auth/esqueci-senha "{\"email\":\"$MARIA_EMAIL\"}")"
# O CI não lê e-mail: gera o mesmo link pela API de admin do Auth e segue até o redirecionamento,
# que traz o token no fragmento, como o navegador receberia.
link=$(curl -s -X POST "$API_URL/auth/v1/admin/generate_link" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' \
  -d "{\"type\":\"recovery\",\"email\":\"$MARIA_EMAIL\",\"redirect_to\":\"$BASE/redefinir-senha\"}" |
  node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).action_link))")
destino=$(curl -s -o /dev/null -w '%{redirect_url}' "$link")
RECUPERACAO=$(node -e "console.log(new URLSearchParams(process.argv[1].split('#')[1]||'').get('access_token')||'')" "$destino")
confere 'link traz token de recuperação' true "$([ -n "$RECUPERACAO" ] && echo true || echo false)"
confere 'página /redefinir-senha abre' 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/redefinir-senha")"
IP=10.0.0.25
confere 'token de login comum → 403' 403 "$(bearer "$MARIA" POST /auth/redefinir-senha '{"nova_senha":"OutraSenha@789"}')"
confere 'nova curta → 400' 400 "$(bearer "$RECUPERACAO" POST /auth/redefinir-senha '{"nova_senha":"123"}')"
confere 'redefine → 204' 204 "$(bearer "$RECUPERACAO" POST /auth/redefinir-senha "{\"nova_senha\":\"$SENHA\"}")"
IP=10.0.0.26
entrar $MARIA_EMAIL $NOVA 401
entrar $MARIA_EMAIL $SENHA
confere 'sem token → 401' 401 "$(bearer - POST /auth/redefinir-senha '{"nova_senha":"OutraSenha@789"}')"

echo '--- logout por Bearer'
entrar $MARIA_EMAIL $SENHA
confere 'logout só com Bearer → 204' 204 "$(bearer "$(js 'r.access_token')" POST /auth/logout)"

if [ "$falhas" -gt 0 ]; then
  echo "$falhas checagem(ns) falharam"
  exit 1
fi
echo 'fechamento: tudo certo'
