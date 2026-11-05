#!/usr/bin/env bash
# Teste ponta a ponta da Etapa 6 (jobs e push). Roda no CI, contra o Supabase local já de pé,
# a API em http://127.0.0.1:3000 e o Expo falso (scripts/ci/expo-falso.mjs) em :4000.
# Precisa de INTERNAL_API_KEY no ambiente (a mesma que a API recebeu).
set -euo pipefail

API=http://127.0.0.1:3000/api/v1
EXPO=http://127.0.0.1:4000
export PGPASSWORD=postgres
sql() { psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAq -v ON_ERROR_STOP=1 -c "$1"; }

DIR=$(mktemp -d)
falhas=0

# confere <descrição> <esperado> <obtido>
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

campo() { node -e "const r=require('$DIR/r.json'); console.log(r['$1'])"; }

login() {
  confere "login $1" 200 "$(req "$1" POST /auth/login "{\"email\":\"$2\",\"senha\":\"Senha@123\"}")"
}

login maria maria.souza@email.com
login joao joao.silva@email.com
login admin admin@bsseguros.com.br

echo '--- dispositivos'
confere 'token inválido → 400' 400 "$(req maria POST /dispositivos '{"push_token":"abc","plataforma":"ANDROID"}')"
confere 'plataforma inválida → 400' 400 "$(req maria POST /dispositivos '{"push_token":"ExponentPushToken[ci-maria]","plataforma":"WEB"}')"
confere 'sem sessão → 401' 401 "$(req anonimo POST /dispositivos '{"push_token":"ExponentPushToken[ci-maria]","plataforma":"ANDROID"}')"
confere 'Maria registra aparelho → 201' 201 "$(req maria POST /dispositivos '{"push_token":"ExponentPushToken[ci-maria]","plataforma":"ANDROID"}')"
confere 'registrar de novo atualiza (sem duplicar) → 201' 201 "$(req maria POST /dispositivos '{"push_token":"ExponentPushToken[ci-maria]","plataforma":"IOS"}')"
confere 'Maria tem 1 aparelho, agora IOS' 'IOS' "$(sql "SELECT string_agg(plataforma, ',') FROM dispositivo WHERE perfil_id = '22222222-2222-2222-2222-222222222222'")"
confere 'João registra aparelho (app desinstalado) → 201' 201 "$(req joao POST /dispositivos '{"push_token":"ExponentPushToken[ci-Morto]","plataforma":"ANDROID"}')"

echo '--- campanhas'
confere 'segurado não manda campanha → 403' 403 "$(req maria POST /admin/campanhas '{"titulo":"x","mensagem":"y"}')"
confere 'campanha sem título → 400' 400 "$(req admin POST /admin/campanhas '{"titulo":"","mensagem":"y"}')"
confere 'campanha com produto inválido → 400' 400 "$(req admin POST /admin/campanhas '{"titulo":"x","mensagem":"y","produto":"MOTO"}')"
confere 'campanha para todos → 201' 201 "$(req admin POST /admin/campanhas '{"titulo":"Novidade","mensagem":"Campanha do CI"}')"
# Segurados com aceita_marketing: Maria, João, Carlos e Fernanda. Ana desativou; o admin não é segurado.
confere 'campanha chegou a 4 (Ana desativou marketing)' 4 "$(campo destinatarios)"
confere 'Ana não recebeu a campanha' 0 "$(sql "SELECT count(*) FROM notificacao WHERE tipo = 'MARKETING' AND perfil_id = '44444444-4444-4444-4444-444444444444'")"
confere 'campanha só AUTO → 201' 201 "$(req admin POST /admin/campanhas '{"titulo":"Auto","mensagem":"Só auto","produto":"AUTO"}')"
# Apólice AUTO ativa: Maria e Carlos.
confere 'campanha AUTO chegou a 2' 2 "$(campo destinatarios)"

echo '--- aniversário'
# O seed faz o João aniversariar na data do reset; o job das 08:00 é a mesma função.
confere 'job agendado no pg_cron' '0 11 * * *' "$(sql "SELECT schedule FROM cron.job WHERE jobname = 'aniversario-diario'")"
confere 'aniversário: João recebe 1' 1 "$(sql "SELECT public.gerar_notificacoes_aniversario()")"
confere 'aniversário de novo no mesmo dia não duplica' 0 "$(sql "SELECT public.gerar_notificacoes_aniversario()")"

echo '--- push'
confere 'sem chave → 401' 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/internal/push/pendentes")"
confere 'chave errada → 401' 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Authorization: Bearer errada' "$API/internal/push/pendentes")"

push() { curl -s -o "$DIR/r.json" -w '%{http_code}' -X POST -H "Authorization: Bearer $INTERNAL_API_KEY" "$API/internal/push/pendentes"; }

# Expo fora do ar: o que tinha aparelho volta para a fila; quem não tem aparelho fica só na
# central in-app e sai da fila de qualquer jeito.
curl -s -X POST "$EXPO/falhar" >/dev/null
com_aparelho=$(sql "SELECT count(*) FROM notificacao n WHERE push_enviado_em IS NULL AND EXISTS (SELECT 1 FROM dispositivo d WHERE d.perfil_id = n.perfil_id)")
confere 'Expo fora do ar → 200' 200 "$(push)"
confere 'Expo fora do ar: as de quem tem aparelho voltaram' "$com_aparelho" "$(campo devolvidas)"
confere 'Expo fora do ar: continuam pendentes no banco' "$com_aparelho" "$(sql "SELECT count(*) FROM notificacao WHERE push_enviado_em IS NULL")"
confere 'Expo fora do ar: nenhuma mensagem contada como enviada' 0 "$(campo mensagens)"
curl -s -X POST "$EXPO/voltar" >/dev/null

confere 'envio → 200' 200 "$(push)"
confere 'processou as que voltaram' "$com_aparelho" "$(campo processadas)"
confere 'token do app desinstalado foi apagado' 1 "$(campo tokens_removidos)"
confere 'aparelho do João sumiu' 0 "$(sql "SELECT count(*) FROM dispositivo WHERE push_token = 'ExponentPushToken[ci-Morto]'")"
# Maria: as notificações do seed + campanha geral + campanha AUTO, uma mensagem cada.
esperadas_maria=$(sql "SELECT count(*) FROM notificacao WHERE perfil_id = '22222222-2222-2222-2222-222222222222'")
confere 'Expo recebeu as mensagens da Maria (e a do João)' "$((esperadas_maria + $(sql "SELECT count(*) FROM notificacao WHERE perfil_id = '33333333-3333-3333-3333-333333333333'")))" "$(curl -s "$EXPO/recebidas" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).recebidas))")"
confere 'fila vazia' 0 "$(sql "SELECT count(*) FROM notificacao WHERE push_enviado_em IS NULL")"
confere 'segunda chamada não reenvia → 200' 200 "$(push)"
confere 'segunda chamada processou 0' 0 "$(campo processadas)"

echo '--- logout do aparelho'
token=$(node -e "console.log(encodeURIComponent('ExponentPushToken[ci-maria]'))")
confere 'João não apaga aparelho da Maria → 404' 404 "$(req joao DELETE "/dispositivos/$token")"
confere 'Maria remove o aparelho → 204' 204 "$(req maria DELETE "/dispositivos/$token")"
confere 'remover de novo → 404' 404 "$(req maria DELETE "/dispositivos/$token")"

echo '--- permissões no banco'
for f in 'gerar_notificacoes_aniversario()' "enviar_campanha('a','b')" 'reservar_push_pendentes(1)' "liberar_push('{}')"; do
  if psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -tAq -c "SET ROLE anon; SELECT public.$f" >/dev/null 2>&1; then
    confere "anon não executa $f" negado executou
  else
    confere "anon não executa $f" negado negado
  fi
done

echo
if [ "$falhas" -gt 0 ]; then
  echo "$falhas verificação(ões) falharam"
  exit 1
fi
echo 'Etapa 6: tudo certo'
