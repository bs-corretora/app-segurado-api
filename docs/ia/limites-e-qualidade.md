# Limites, qualidade e aprendizados

Item 2.3 do pitch. Descreve o que o código faz hoje; o que não existe está dito como não existente.

## 1. E se a IA falhasse?

A IA é um recurso opcional do app: apólices, sinistros, cotações, contatos de assistência e notificações
funcionam por rotas próprias, sem passar pelo modelo. Falha do assistente não derruba o resto da API.

| Falha | Resposta da API | O que o segurado vê |
|---|---|---|
| Groq fora do ar, falha de rede ou mais de 30 s | 503 `INDISPONIVEL` | Mensagem própria para 503 e botão de tentar de novo |
| Chave inválida, ausente ou expirada | 503 `INDISPONIVEL` (o log traz só o status do provedor) | Igual ao anterior |
| Cota de tokens por minuto esgotada no modelo principal | Nova tentativa no `gpt-oss-20b`; se também esgotar, 503 | Normalmente nada; no pior caso, a mensagem de 503 |
| Segurado passa de 20 perguntas em 10 minutos | 429 com `Retry-After` | Mensagem própria para 429 |
| Modelo inventa ferramenta (`tool_use_failed`) | Nova tentativa sem ferramentas | Texto sem consulta a dados; sem erro |
| Modelo devolve vazio ou fora do formato | 200 com mensagem fixa ou com o texto cru e as fontes do RAG | Resposta sem atalhos |
| Ferramenta falha (banco) | O modelo recebe "Erro ao buscar dados" | Depende do modelo; ele recebe o aviso de erro e decide o que dizer |

Contingência humana: o app mostra o aviso fixo "Respostas geradas por IA podem conter erros. Em caso
de dúvida, fale com a corretora", e a aba "Assistência", com telefones de assistência 24h e central de
sinistros, é independente da IA. Detalhes e linhas de código em [README.md](README.md#5-fallbacks-reais).

Limites assumidos:

- Não há circuit breaker: com o provedor fora do ar, cada pergunta espera a falha (até 30 s por
  tentativa) antes de devolver 503.
- Não há segundo provedor. O reserva é outro modelo da mesma Groq; uma queda geral da Groq derruba o
  assistente por inteiro.
- O rate limit é em memória do processo e não protege a cota da Groq: o 429 da cota vem do provedor.

## 2. Garantia de qualidade dos outputs

Não existe agente de IA que valide a resposta de outra IA, nem detecção automática de alucinação. A
qualidade é tratada em quatro camadas, da prevenção ao teste:

1. **Restringir o que o modelo pode dizer e fazer**
   - Respostas sobre dados vêm de ferramentas de consulta, não da memória do modelo; as ferramentas
     filtram por `perfil_id` da sessão (o modelo não escolhe).
   - Respostas sobre o app vêm de trechos conferidos na mão contra as telas (`b6e725e`), com a fonte
     devolvida ao app.
   - Prompt com os nomes reais das telas, lista fechada de rotas para atalho e proibição de inventar
     função (v4, `8377a19`) e de prometer pagamento ou confirmar cobertura (v5, `feee25f`); `temperature` 0,2 para reduzir variação.
2. **Validar o formato no código** (`assistente.ts:323-327`, `:415-458`): remove cercas de código,
   faz `JSON.parse`, normaliza `fontes` e `atalhos` (aceita `label`/`rota` e `rotulo`/`tela`), cai para
   texto simples quando não é JSON. No app, atalho para tela desconhecida some, o texto é sempre exibido
   como texto (nunca como HTML) e o Markdown residual é limpo (`textoAssistente`, PR #28 do app).
3. **Testes automatizados.** `tests/unit/assistente.test.ts` (25 testes) cobre:
   - busca de conhecimento: trechos relevantes, "esqueci a senha" em primeiro lugar, erro devolve lista vazia;
   - cada uma das 6 ferramentas e o uso do `perfil_id` da sessão (com tentativa de injeção de
     outro `perfil_id` na pergunta);
   - limite de 10 mensagens de histórico e de 5 chamadas de ferramenta;
   - fallback sem JSON, JSON cercado por bloco de código, normalização de fontes e atalhos;
   - provedor: erro HTTP e falha de rede viram erro de indisponibilidade; formato das ferramentas e da
     chave na chamada;
   - recuos: `tool_use_failed`, modelo reserva no 429, 503 quando o reserva também esgota;
   - o prompt de sistema enviado à Groq contém a regra de não prometer pagamento nem confirmar cobertura (#69).
   O CI roda `npm run test:coverage` com mínimo de 80% de linhas, além de lint, `tsc` e build.
4. **Teste manual ponta a ponta em produção** (19/11/2026, Groq com o banco de produção, conta de
   teste): 5 de 5 perguntas com os dados da conta e atalho correto (PR #59); 3 perguntas com os
   nomes corretos de abas e botões após a v4 (PR #60). Os resultados estão nos corpos dos PRs, não em um
   relatório separado.

**Não coberto:** as chamadas à Groq são simuladas nos testes, então o texto do prompt e o comportamento
real do modelo (alucinação, tom, nome de tela errado) só são verificados à mão. Não há conjunto fixo de
perguntas de avaliação nem medição de taxa de erro. O PR #56 cita um roteiro de 15 perguntas manuais
(`ROTEIRO_TESTE_MANUAL.md`), que não está no repositório.

## 3. O que a IA não faz

| Não faz | Como é garantido |
|---|---|
| Abrir sinistro, pedir cotação ou alterar qualquer dado | As 6 ferramentas são só de consulta (`assistente.ts:77-148`); o prompt também proíbe. Para agir, o app dá atalho para a tela e o segurado faz a ação |
| Ver dado de outro segurado | `perfil_id` vem da sessão, nunca do modelo nem da pergunta |
| Guardar conversa | O servidor não persiste histórico; ele fica só na tela do app |
| Falar com base em CPF, e-mail ou senha | Nenhuma ferramenta devolve esses campos |

Corrigido em 25/11/2026 (#69, v5 do prompt): a regra "nunca afirmar que um sinistro será pago" e a de não
confirmar cobertura, previstas no P-01, agora estão no prompt de sistema, com teste unitário que confere o prompt
enviado à Groq. O comportamento real do modelo continua verificável só à mão (ver "Não coberto").

Planejado e **não implementado** (a entrega parcial previa; o repositório não registra o motivo, então
confirmar com o grupo antes do pitch como justificar):

- Triagem e resumo de sinistro por IA (P-02), com sinalização de emergência. Hoje o relato do segurado
  vai direto ao operador, sem sugestão de IA.
- Rascunho de campanha por IA (P-03). Hoje a campanha é escrita pelo operador no painel.
- Busca vetorial (`pgvector`) e conjunto de 30 perguntas de avaliação.

## 4. Aprendizados (observados no histórico)

- **Modelo e provedor mudam.** O `claude-3-5-haiku` foi aposentado (`65701f1`) e o
  `llama-3.3-70b-versatile` saiu da Groq (PR #59). Manter o modelo em `ASSISTENTE_MODELO` e o provedor
  atrás de uma função (`chamarModelo`) fez a troca caber em poucos commits.
- **Mock não pega o que a API real faz.** `tool_use_failed` e o 429 da cota só apareceram no teste com a
  chave real; viraram testes unitários depois (casos 2 e 3 de [prompts-que-falharam.md](prompts-que-falharam.md)).
- **O modelo preenche lacuna com nome plausível.** Sem os rótulos reais no prompt, inventou abas e
  botões; a correção foi dar a lista, não pedir "seja preciso". A base de conhecimento tinha o mesmo
  problema e foi conferida contra as telas.
- **Contrato de saída tolerante.** O modelo troca `rotulo`/`label` e `tela`/`rota`; normalizar no
  servidor evitou quebrar o app.
- **Privacidade por construção.** Log só com status, perfil e duração; erro do provedor sem corpo,
  porque ele pode repetir a pergunta.
- **Limite do plano gratuito molda o desenho.** `max_tokens` de 800 e 3 trechos de RAG vieram da cota de
  8 mil tokens por minuto, não de uma escolha de qualidade ([custo.md](custo.md)).
