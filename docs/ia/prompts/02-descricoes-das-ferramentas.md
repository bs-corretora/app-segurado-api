# Descrições das ferramentas (tool calling)

- **Origem:** `src/lib/services/assistente.ts:77-148` (constante `TOOLS`); execução em `:213-256`
  (`executarTool`).
- **Uso:** enviadas em toda chamada com `tool_choice: auto`, exceto na repetição sem ferramentas
  ([../README.md](../README.md#fallbacks-reais)). As descrições fazem parte do prompt: é por elas que o
  modelo decide quando consultar os dados do segurado.
- **Segurança:** nenhuma ferramenta recebe `perfil_id` do modelo. Ele vem da sessão autenticada
  (`processarAssistente(mensagens, perfilId)`). Todas são somente leitura.
- **Versão vigente:** v4. O texto das descrições não mudou desde a v2; o formato de envio mudou na v3
  (`input_schema` do SDK da Anthropic passou a `parameters` do formato OpenAI).
- **Tamanho enviado:** 1.711 caracteres de JSON (medido com o código atual).

| Ferramenta | Descrição enviada ao modelo | Parâmetros |
|---|---|---|
| `buscar_apolices` | Lista as apólices do segurado autenticado. Retorna: id, produto, numero, status, inicio_vigencia, fim_vigencia. | nenhum |
| `buscar_apolice_detalhe` | Busca detalhes de uma apólice específica do segurado (inclui prêmio). Requer o ID da apólice. | apolice_id * |
| `buscar_sinistros` | Lista os sinistros do segurado autenticado. Retorna: id, protocolo, tipo, status, data_ocorrencia, local. | nenhum |
| `buscar_contatos_assistencia` | Lista contatos de assistência 24h e central de sinistros filtrados pelos produtos das apólices ativas do segurado. | tipo (ASSISTENCIA_24H ou SINISTRO) * |
| `buscar_notificacoes` | Lista notificações do segurado (sistema, marketing). Parâmetro opcional para apenas não lidas. | nao_lidas |
| `buscar_dashboard` | Retorna resumo do perfil: nome, iniciais, tempo de casa, aniversário hoje, apólices ativas, notificações não lidas. | nenhum |

\(*) obrigatório. Ferramenta inexistente: `executarTool` devolve "Tool desconhecida" (`:253-254`).
Limites: no máximo 5 execuções de ferramenta por pergunta e 5 voltas do laço (`:367-404`); as listas
devolvem no máximo 20 itens (`:220`, `:235`, `:246`).
