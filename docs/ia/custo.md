# Custo do uso de IA

Item 2.2 do pitch. **Todos os números de consumo são estimativas calculadas a partir do código**, não
medições. O app não registra o consumo real de tokens (a resposta da Groq traz `usage`, mas o código
não o lê nem o grava), então não existe tabela de execução para conferir. Medir isso é a primeira
melhoria recomendada (seção 7).

## 1. Preço por token (fonte e data)

Consultado em **25/11/2026**:

| Modelo | Entrada (US$ por 1 M tokens) | Saída (US$ por 1 M tokens) | Fonte |
|---|---|---|---|
| `openai/gpt-oss-120b` | 0,15 | 0,60 | https://console.groq.com/docs/models (tabela "Production Models", coluna "Price per 1M tokens") |
| `openai/gpt-oss-20b` | 0,075 | 0,30 | idem |

- A página `https://groq.com/pricing` não lista preço por modelo; vale a tabela da documentação.
- Preço de entrada com cache não consta na tabela consultada; o cálculo abaixo não usa desconto de cache.
- **Conferir antes da apresentação:** os preços acima, na data da apresentação. A página não exibe data.
- Câmbio: o cálculo fica em dólar. **Conferir** a cotação do dia para converter em reais.

## 2. Tokens por pergunta (estimativa a partir do código)

Regra usada: 1 token para cada 3,5 caracteres de texto em português (aproximação; o tokenizador real
do modelo pode divergir). Caracteres medidos no código da `main` em `4d86d93`.

| Parte da entrada | Caracteres | Tokens estimados | Origem |
|---|---|---|---|
| Prompt de sistema | 3.617 | 1.030 | `assistente.ts:150-211` |
| Descrição das 6 ferramentas (JSON enviado) | 1.711 | 490 | `assistente.ts:77-148` |
| Contexto RAG: 3 trechos de, em média, 510 caracteres, mais cabeçalho | cerca de 1.800 (máx. 2.121) | 515 (máx. 606) | `supabase/conhecimento/*.md` |
| Pergunta e histórico curto (premissa) | - | 200 | até 10 mensagens de até 4.000 caracteres: pode ser maior |
| **Entrada da primeira chamada** | | **cerca de 2.250** | |

Saída: teto de 800 tokens por chamada (`max_tokens`, `assistente.ts:271`). Premissa de resposta típica: 300
tokens. Se os tokens de raciocínio do `gpt-oss` contarem como saída, o consumo de saída sobe; **conferir**
na resposta real da Groq (campo `usage`).

Dois perfis de pergunta:

| Perfil | Chamadas ao modelo | Entrada total | Saída total |
|---|---|---|---|
| A. Dúvida sobre o app (só RAG, sem ferramenta) | 1 | 2.235 | 300 |
| B. Dado do segurado (1 ferramenta; resultado de cerca de 600 tokens volta ao modelo) | 2 | 5.130 | 360 |
| Teto do código: 5 ferramentas, 6 chamadas, contexto crescendo | 6 | 23.310 | 1.100 |

## 3. Custo por pergunta

Fórmula: entrada x preço de entrada + saída x preço de saída.

| Modelo | A (só RAG) | B (1 ferramenta) | Mistura 50% A / 50% B | Teto do código |
|---|---|---|---|---|
| `gpt-oss-120b` | US$ 0,00052 | US$ 0,00099 | **US$ 0,00075** | US$ 0,0042 |
| `gpt-oss-20b` | US$ 0,00026 | US$ 0,00049 | **US$ 0,00038** | US$ 0,0021 |

## 4. Custo por usuário e por 1.000 usuários por mês

Premissa explícita (a validar com uso real): **1.000 segurados usam o assistente, 8 perguntas por
usuário por mês**, metade delas com consulta a dados. Sem pesquisa de uso; é um número de partida.

| Cenário | Perguntas/mês | `gpt-oss-120b` | `gpt-oss-20b` |
|---|---|---|---|
| 8 perguntas por usuário (base) | 8.000 | **US$ 6,00** (US$ 0,006 por usuário) | US$ 3,00 |
| 30 perguntas por usuário (uso alto) | 30.000 | US$ 22,51 | US$ 11,26 |
| 8 perguntas, todas no teto do código (pior caso) | 8.000 | US$ 33,25 | US$ 16,63 |

O custo de IA é desprezível frente a outros custos do produto: mesmo no uso alto (30 perguntas), fica em cerca de US$ 0,02
por usuário por mês. A premissa que mais pesa é o número de perguntas, não o modelo.

## 5. Trade-off 120b x 20b

- O 20b custa a metade e tem cota própria na Groq, por isso já funciona como reserva no 429.
- O principal é o 120b: foi o padrão adotado no PR #59, depois de o modelo anterior sair da Groq e de a
  chamada de ferramenta ser conferida nele (o PR não registra comparação com outros modelos). **Não foi feita comparação sistemática
  de qualidade entre os dois**: não há conjunto de avaliação. Quando o 20b responde (modo reserva),
  a qualidade não foi medida separadamente.
- Em escala, o 20b como modelo único cortaria o custo de IA pela metade, mas a decisão só deve ser
  tomada depois de rodar um conjunto de perguntas nos dois modelos e comparar erros de ferramenta,
  de nome de tela e de formato JSON.

## 6. Plano gratuito x pago e viabilidade em escala

- **Plano gratuito (o que a API usa hoje):** cota de **8 mil tokens por minuto por modelo**, medida no
  PR #59. Com 2.500 a 5.500 tokens por pergunta, cabem cerca de 1 a 3 perguntas por minuto em cada modelo;
  com o reserva, cerca de o dobro. A página de limites também informa 30 requisições por minuto, 1 mil
  por dia e 200 mil tokens por dia por modelo (`https://console.groq.com/docs/rate-limits`, acessada em
  25/11/2026), o que daria da ordem de 50 perguntas por dia por modelo. **Conferir** se essa linha da
  página vale para o plano gratuito: a documentação de modelos mostra 250 mil tokens por minuto para o
  plano pago ("Developer"), e as duas páginas não deixam claro qual coluna é de qual plano.
- **Consequência:** o plano gratuito serve para a demonstração e o piloto (poucos usuários simultâneos).
  Não serve para a base real: bastam 4 ou 5 segurados perguntando no mesmo minuto para esgotar a cota
  dos dois modelos, e a resposta é 503 ("temporariamente indisponível").
- **Plano pago:** o custo por pergunta acima passa a valer na fatura e a cota por minuto sobe
  (conferir o limite exato da conta). Com a premissa da seção 4, o gasto é de unidades de dólar por mês.
- **Rate limit do app:** 20 perguntas por 10 minutos por segurado limita o pior caso por usuário a
  cerca de 120 perguntas por hora; com 1.000 usuários isso é só teórico.
- **Pendente (investimento):** migrar do plano gratuito para o pago é custo de cartão que depende da
  BS Seguros; registrar no painel de investimentos quando houver decisão.

## 7. Como trocar estimativa por medição

1. Ler `usage.prompt_tokens` e `usage.completion_tokens` da resposta da Groq e registrar (só números,
   sem texto) junto do status e da duração que a rota já registra.
2. Somar por dia e por perfil e conferir contra a fatura da Groq.
3. Recalcular as tabelas acima com a média medida e a proporção real de perguntas com ferramenta.
