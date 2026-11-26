#!/usr/bin/env bash
# Teste ponta a ponta do e-mail (#71 confirmação no cadastro, #72 avisos com fila). Roda no CI,
# contra o Supabase local e a API em http://127.0.0.1:3000, SEM RESEND_API_KEY: a API fica no modo
# só-log, e o código de confirmação é gerado aqui pela API de admin do Auth (o mesmo generateLink
# que a API usa). Precisa de INTERNAL_API_KEY no ambiente e do log da API em ./api.log.
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

# Cota própria nos limites por IP: cada bloco usa um IP só dele.
IP=10.0.0.40

# req <token|-> <metodo> <rota> [corpo]
req() {
  local token=$1 metodo=$2 rota=$3 corpo=${4:-}
  local args=(-s -o "$DIR/r.json" -w '%{http_code}' -X "$metodo" -H "X-Forwarded-For: $IP")
  [ "$token" != "-" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")
  curl "${args[@]}" "$API$rota"
}

js() { node -e "const fs=require('fs');const t=fs.readFileSync('$DIR/r.json','utf8');const r=t?JSON.parse(t):{};console.log($1)"; }

# Código de confirmação novo, pela API de admin do Auth (o CI não lê e-mail). A senha mandada aqui
# é DIFERENTE da do cadastro: o login depois prova que o generateLink não troca a senha de quem já existe.
codigo_do_auth() {
  curl -s -X POST "$API_URL/auth/v1/admin/generate_link" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H 'Content-Type: application/json' \
    -d "{\"type\":\"signup\",\"email\":\"$1\",\"password\":\"NaoEhASenha999\"}" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).email_otp||''))"
}

# CPF válido e aleatório (dígitos verificadores calculados)
CPF=$(node -e 'const d=[...Array(9)].map(()=>Math.floor(Math.random()*10));for(const n of [9,10]){let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);const r=(s*10)%11;d.push(r===10?0:r)}console.log(d.join(""))')
EMAIL="ci.email.$(date +%s)@email.com"
SENHA=Senha@1234

echo '--- cadastro não entra; login antes de confirmar é 403'
CORPO="{\"nome\":\"Teste Email\",\"cpf\":\"$CPF\",\"email\":\"$EMAIL\",\"telefone\":\"81977776666\",\"data_nascimento\":\"1990-01-01\",\"senha\":\"$SENHA\",\"aceite_termos\":true}"
confere 'cadastro → 201' 201 "$(req - POST /auth/cadastro "$CORPO")"
confere 'cadastro pede confirmação' true "$(js 'r.confirmar_email')"
confere 'cadastro não devolve token' undefined "$(js 'r.access_token')"
confere 'conta nasce sem e-mail confirmado' t "$(sql "SELECT email_confirmed_at IS NULL FROM auth.users WHERE email = '$EMAIL'")"
confere 'código gerado no cadastro (confirmation_sent_at)' t "$(sql "SELECT confirmation_sent_at IS NOT NULL FROM auth.users WHERE email = '$EMAIL'")"
confere 'login antes de confirmar → 403' 403 "$(req - POST /auth/login "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}")"
confere 'erro EMAIL_NAO_CONFIRMADO' EMAIL_NAO_CONFIRMADO "$(js 'r.erro')"
confere 'senha errada continua 401 (não revela a conta)' 401 "$(req - POST /auth/login "{\"email\":\"$EMAIL\",\"senha\":\"Errada@999\"}")"

echo '--- reenviar código'
IP=10.0.0.41
antes=$(sql "SELECT confirmation_sent_at FROM auth.users WHERE email = '$EMAIL'")
confere 'reenviar para conta não confirmada → 204' 204 "$(req - POST /auth/reenviar-codigo "{\"email\":\"$EMAIL\"}")"
confere 'reenviar gerou código novo' t "$(sql "SELECT confirmation_sent_at > '$antes' FROM auth.users WHERE email = '$EMAIL'")"
NINGUEM="ninguem.$(date +%s)@email.com"
confere 'reenviar para e-mail sem conta → 204' 204 "$(req - POST /auth/reenviar-codigo "{\"email\":\"$NINGUEM\"}")"
confere 'e-mail sem conta NÃO vira usuário no Auth' 0 "$(sql "SELECT count(*) FROM auth.users WHERE email = '$NINGUEM'")"
confere 'reenviar com e-mail inválido → 400' 400 "$(req - POST /auth/reenviar-codigo '{"email":"x"}')"

echo '--- confirmar'
IP=10.0.0.42
confere 'código errado → 400' 400 "$(req - POST /auth/confirmar-email "{\"email\":\"$EMAIL\",\"codigo\":\"000000\"}")"
confere 'erro CODIGO_INVALIDO' CODIGO_INVALIDO "$(js 'r.erro')"
confere 'código com 5 dígitos → 400 VALIDACAO' VALIDACAO "$(req - POST /auth/confirmar-email "{\"email\":\"$EMAIL\",\"codigo\":\"12345\"}" >/dev/null; js 'r.erro')"
CODIGO=$(codigo_do_auth "$EMAIL")
confere 'generateLink devolve código de 6 dígitos' true "$([[ "$CODIGO" =~ ^[0-9]{6}$ ]] && echo true || echo false)"
confere 'código certo → 200' 200 "$(req - POST /auth/confirmar-email "{\"email\":\"$EMAIL\",\"codigo\":\"$CODIGO\"}")"
TOKEN=$(js 'r.access_token')
confere 'confirmar devolve tokens como o login' true "$(js 'typeof r.access_token === "string" && typeof r.refresh_token === "string" && r.expires_in === 3600')"
confere 'sessão do confirmar vale em /me' 200 "$(req "$TOKEN" GET /me)"
confere 'código já usado → 400' 400 "$(req - POST /auth/confirmar-email "{\"email\":\"$EMAIL\",\"codigo\":\"$CODIGO\"}")"
IP=10.0.0.43
confere 'login depois de confirmar → 200 (senha original intacta)' 200 "$(req - POST /auth/login "{\"email\":\"$EMAIL\",\"senha\":\"$SENHA\"}")"
antes=$(sql "SELECT confirmation_sent_at FROM auth.users WHERE email = '$EMAIL'")
confere 'reenviar para conta confirmada → 204' 204 "$(req - POST /auth/reenviar-codigo "{\"email\":\"$EMAIL\"}")"
confere 'conta confirmada não ganha código novo' t "$(sql "SELECT confirmation_sent_at = '$antes' FROM auth.users WHERE email = '$EMAIL'")"

echo '--- contas antigas seguem entrando'
IP=10.0.0.44
confere 'login de conta do seed → 200' 200 "$(req - POST /auth/login '{"email":"fernanda.costa@email.com","senha":"Senha@123"}')"

echo '--- fila do e-mail'
confere 'notificações do seed não entram na fila' 0 "$(sql "SELECT count(*) FROM notificacao WHERE id::TEXT LIKE '9e44%' AND email_enviado_em IS NULL")"
confere 'nada pendente antes do teste' 0 "$(sql "SELECT count(*) FROM notificacao WHERE email_enviado_em IS NULL AND email_tentativas < 3 AND tipo = 'SISTEMA' AND destino_tipo IN ('SINISTRO','COTACAO')")"

IP=10.0.0.45
confere 'login admin' 200 "$(req - POST /auth/login '{"email":"admin@bsseguros.com.br","senha":"Senha@123"}')"
ADMIN=$(js 'r.access_token')
MARIA=22222222-2222-2222-2222-222222222222
SIN=$(sql "INSERT INTO sinistro (perfil_id, apolice_id, tipo, data_ocorrencia, local, descricao)
  SELECT '$MARIA', id, 'COLISAO', now() - INTERVAL '1 day', 'Recife-PE', 'Sinistro do teste de e-mail.'
  FROM apolice WHERE perfil_id = '$MARIA' AND status = 'ATIVA' LIMIT 1 RETURNING id" | head -1)
confere 'admin muda status do sinistro → 200' 200 "$(req "$ADMIN" PATCH "/admin/sinistros/$SIN/status" '{"status":"EM_ANALISE","comentario":"Perícia marcada para amanhã."}')"
confere 'aviso do sinistro saiu na hora (1 tentativa)' 't|1' "$(sql "SELECT email_enviado_em IS NOT NULL, email_tentativas FROM notificacao WHERE destino_id = '$SIN'")"

COT=$(sql "INSERT INTO cotacao (perfil_id, produto, motivo, dados) VALUES ('$MARIA', 'VIDA', 'NOVO', '{}') RETURNING id" | head -1)
confere 'admin responde cotação → 200' 200 "$(req "$ADMIN" PATCH "/admin/cotacoes/$COT/resposta" '{"resposta":"Plano a partir de R$ 30/mês.","valor_estimado":360}')"
confere 'aviso da cotação saiu na hora' 't|1' "$(sql "SELECT email_enviado_em IS NOT NULL, email_tentativas FROM notificacao WHERE destino_id = '$COT'")"

echo '--- reenvio pelo job'
INTERNA=(-s -o "$DIR/r.json" -w '%{http_code}' -X POST)
confere 'job sem chave → 401' 401 "$(curl "${INTERNA[@]}" "$API/internal/email/pendentes")"
# Simula uma falha do envio na hora: a notificação volta para a fila.
sql "UPDATE notificacao SET email_enviado_em = NULL WHERE destino_id = '$SIN'" >/dev/null
confere 'job → 200' 200 "$(curl "${INTERNA[@]}" -H "Authorization: Bearer $INTERNAL_API_KEY" "$API/internal/email/pendentes")"
confere 'job reenviou o aviso que estava na fila' '1|1' "$(js 'r.processadas + "|" + r.enviados')"
confere 'segunda tentativa registrada' 't|2' "$(sql "SELECT email_enviado_em IS NOT NULL, email_tentativas FROM notificacao WHERE destino_id = '$SIN'")"
# Na 3ª tentativa a notificação sai da fila, mesmo sem e-mail enviado.
sql "UPDATE notificacao SET email_enviado_em = NULL, email_tentativas = 3 WHERE destino_id = '$SIN'" >/dev/null
confere 'job ignora quem já tentou 3 vezes' 0 "$(curl "${INTERNA[@]}" -H "Authorization: Bearer $INTERNAL_API_KEY" "$API/internal/email/pendentes" >/dev/null; js 'r.processadas')"

echo '--- log sem dado pessoal'
confere 'log registrou o código de confirmação (modo só-log)' true "$(grep -q 'codigo-confirmacao' api.log && echo true || echo false)"
confere 'log registrou os avisos' true "$(grep -q 'aviso-sinistro' api.log && grep -q 'aviso-cotacao' api.log && echo true || echo false)"
confere 'log não tem o e-mail do teste' 0 "$(grep -c "$EMAIL" api.log || true)"
confere 'log não tem o código' 0 "$(grep -c "$CODIGO" api.log || true)"
confere 'log não tem o CPF' 0 "$(grep -c "$CPF" api.log || true)"

if [ "$falhas" -gt 0 ]; then
  echo "$falhas checagem(ns) falharam"
  exit 1
fi
echo 'email: tudo certo'
