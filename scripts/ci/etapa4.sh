#!/usr/bin/env bash
# Teste ponta a ponta da Etapa 4 (sinistro, cotação, indicação). Roda no CI, contra o Supabase
# local e a API em http://127.0.0.1:3000.
set -euo pipefail

BASE=http://127.0.0.1:3000
API=$BASE/api/v1
# O limite de login é por IP (último valor do X-Forwarded-For). Sem proxy no CI, cada script usa
# um IP próprio para não gastar a cota dos outros.
IP=10.0.0.4
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

# js <expressão sobre r> — lê o último corpo de resposta
js() { node -e "const r=require('$DIR/r.json'); console.log($1)"; }

MARIA=22222222-2222-2222-2222-222222222222
AUTO_ATIVA=6f1c1111-1111-1111-1111-111111111111
VIDA_VENCIDA=6f1c2223-2222-2222-2222-222222222222
DO_JOAO=6f1c3334-3333-3333-3333-333333333333
ONTEM=$(date -u -d 'yesterday' +%Y-%m-%dT10:00:00-03:00)
AMANHA=$(date -u -d 'tomorrow' +%Y-%m-%dT10:00:00-03:00)

confere 'login maria' 200 "$(req maria POST /auth/login '{"email":"maria.souza@email.com","senha":"Senha@123"}')"
confere 'login joao' 200 "$(req joao POST /auth/login '{"email":"joao.silva@email.com","senha":"Senha@123"}')"

echo '--- sinistros'
confere 'sem sessão → 401' 401 "$(req anonimo GET /sinistros)"
confere 'tipo inválido → 400' 400 "$(req maria POST /sinistros "{\"apolice_id\":\"$AUTO_ATIVA\",\"tipo\":\"ENCHENTE\",\"data_ocorrencia\":\"$ONTEM\"}")"
confere 'data no futuro → 400' 400 "$(req maria POST /sinistros "{\"apolice_id\":\"$AUTO_ATIVA\",\"tipo\":\"COLISAO\",\"data_ocorrencia\":\"$AMANHA\"}")"
confere 'apólice vencida → 409' 409 "$(req maria POST /sinistros "{\"apolice_id\":\"$VIDA_VENCIDA\",\"tipo\":\"OUTROS\",\"data_ocorrencia\":\"$ONTEM\"}")"
confere 'apólice de outro segurado → 404' 404 "$(req maria POST /sinistros "{\"apolice_id\":\"$DO_JOAO\",\"tipo\":\"ROUBO\",\"data_ocorrencia\":\"$ONTEM\"}")"
antes=$(sql "SELECT count(*) FROM sinistro WHERE perfil_id = '$MARIA'")
confere 'abrir sinistro → 201' 201 "$(req maria POST /sinistros "{\"apolice_id\":\"$AUTO_ATIVA\",\"tipo\":\"COLISAO\",\"data_ocorrencia\":\"$ONTEM\",\"local\":\"Recife\",\"descricao\":\"Batida leve\"}")"
id=$(js 'r.id')
confere 'protocolo no formato SIN-AAAA-NNNNNN' true "$(js '/^SIN-\d{4}-\d{6}$/.test(r.protocolo)')"
confere 'nasce ABERTO' ABERTO "$(js 'r.status')"
confere 'evento ABERTO gravado junto' 1 "$(sql "SELECT count(*) FROM sinistro_evento WHERE sinistro_id = '$id' AND status = 'ABERTO'")"
confere 'tentativas recusadas não gravaram nada' "$((antes + 1))" "$(sql "SELECT count(*) FROM sinistro WHERE perfil_id = '$MARIA'")"
confere 'listar → 200' 200 "$(req maria GET /sinistros)"
confere 'novo sinistro é o primeiro da lista' "$id" "$(js 'r.itens[0].id')"
confere 'detalhe → 200' 200 "$(req maria GET "/sinistros/$id")"
confere 'detalhe traz a linha do tempo' ABERTO "$(js 'r.eventos[0].status')"
confere 'João não vê o sinistro da Maria → 404' 404 "$(req joao GET "/sinistros/$id")"
confere 'id malformado → 404' 404 "$(req maria GET /sinistros/abc)"

echo '--- cotações'
confere 'produto inválido → 400' 400 "$(req maria POST /cotacoes '{"produto":"MOTO","motivo":"NOVO"}')"
confere 'motivo inválido → 400' 400 "$(req maria POST /cotacoes '{"produto":"AUTO","motivo":"TROCA"}')"
confere 'dados aninhados → 400' 400 "$(req maria POST /cotacoes '{"produto":"AUTO","motivo":"NOVO","dados":{"carro":{"modelo":"x"}}}')"
confere 'pedir cotação → 201' 201 "$(req maria POST /cotacoes '{"produto":"AUTO","motivo":"NOVO","dados":{"modelo":"Onix 2022","placa":"ABC1D23"}}')"
cot=$(js 'r.id')
confere 'nasce RECEBIDA' RECEBIDA "$(js 'r.status')"
confere 'dados gravados no jsonb' 'Onix 2022' "$(sql "SELECT dados->>'modelo' FROM cotacao WHERE id = '$cot'")"
confere 'listar cotações → 200' 200 "$(req maria GET /cotacoes)"
confere 'Maria vê a nova e a do seed' 2 "$(js 'r.total')"
confere 'João não vê cotações da Maria' 0 "$(req joao GET /cotacoes >/dev/null; js "r.itens.filter(c => c.id === '$cot').length")"

echo '--- indicações'
confere 'link → 200' 200 "$(req maria GET /indicacoes/link)"
confere 'código da Maria' MARIA123 "$(js 'r.codigo')"
confere 'link aponta para a página pública' true "$(js "r.link.endsWith('/indicacao/MARIA123')")"
pub() { curl -s -o "$DIR/r.json" -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "X-Forwarded-For: $IP" -d "$2" "$API/public/indicacoes/$1"; }
confere 'telefone inválido → 400' 400 "$(pub MARIA123 '{"nome":"Rafael Lima","telefone":"123"}')"
confere 'código inexistente → 404' 404 "$(pub NAOEXISTE '{"nome":"Rafael Lima","telefone":"81998765432"}')"
confere 'código do administrador não vale → 404' 404 "$(pub ADM001 '{"nome":"Rafael Lima","telefone":"81998765432"}')"
confere 'indicado deixa os dados → 201' 201 "$(pub maria123 '{"nome":"Rafael Lima","telefone":"(81) 99876-5432","email":"Rafael@Email.com"}')"
confere 'resposta não expõe quem indicou' false "$(js "JSON.stringify(r).includes('Maria')")"
confere 'gravado para a Maria, telefone só dígitos, e-mail minúsculo' "81998765432|rafael@email.com|NOVA" "$(sql "SELECT telefone || '|' || email || '|' || status FROM indicacao WHERE indicador_id = '$MARIA' AND nome = 'Rafael Lima'")"
confere 'listar indicações → 200' 200 "$(req maria GET /indicacoes)"
confere 'Maria vê as 2 indicações dela' 2 "$(js 'r.total')"
confere 'lista não expõe telefone do indicado' false "$(js "'telefone' in r.itens[0]")"
confere 'página pública → 200' 200 "$(curl -s -o "$DIR/pagina.html" -w '%{http_code}' "$BASE/indicacao/MARIA123")"
confere 'página tem o formulário' true "$(grep -q 'Quero ser contatado' "$DIR/pagina.html" && echo true || echo false)"

echo
if [ "$falhas" -gt 0 ]; then
  echo "$falhas verificação(ões) falharam"
  exit 1
fi
echo 'Etapa 4: tudo certo'
