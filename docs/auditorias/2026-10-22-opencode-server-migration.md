# OpenCode servidor v1 — migracao fase 1

Data: 22/10/2026. Referencia: https://github.com/getpaseo/paseo/blob/main/docs/providers.md

## Concluido
- Integracao `OpenCodeServerRuntime` por servidor nativo, reutilizado entre Boos e workspaces.
- O processo inicia `opencode serve --pure --hostname 127.0.0.1 --port 0`, com senha aleatoria e Basic Auth, somente loopback.
- Criacao e retomada de sessoes reais via HTTP (/session); modelo no formato provider/model; catalogo via /provider.
- Contexto e estado mantidos no servidor entre chamadas ao broker de ferramentas, sem reiniciar a CLI por acao.
- Streaming SSE de texto para conversas sem ferramentas, reconexao e reconciliacao com resposta HTTP.
- Ferramentas nativas, MCP, plugins herdados e permissao nativa ficam desabilitados; escrita e terminal passam exclusivamente pelo broker Boobot.
- Cancelamento em /session/{id}/abort, timeout e falhas de servidor terminalizam turnos.
- Adaptador anterior preservado por `BOOBOT_OPENCODE_TRANSPORT=cli` (definido antes de iniciar Boobot).
- Verificacao de versao: adaptador implementa v1; v2 deve ter integracao propria.
- Voz nao foi alterada.

## Validacao
- OpenCode instalado na maquina: 1.18.35.
- Teste real de inicializacao de servidor e sessao HTTP executado com `opencode/beam-free`. O servidor respondeu; inferencia recusada pelo provedor: "OpenCode's free tier can only be used from within OpenCode".
- Portanto **nao ha prova de programacao com modelo OpenCode externo** nesta fase. Essa restricao nao deve ser contornada.
- Teste com HTTP simulado verificou duas interacoes de ferramenta na mesma sessao, streaming SSE sem repeticao, isolamento de ferramentas, recuperacao de sessao e falha se sessao nao existir.
- Build, typecheck e regressao passaram na fase 1 (verificar as execucoes mais recentes).

## Pendencias
1. Migrar o broker textual JSON para ferramentas nativas integradas por plugin com permissao por sessao, como o Paseo faz no v1. Nao disponibilizar comandos nativos sem essa mediacao.
2. Migrar `POST /session/{id}/message` para `prompt_async` e eventos SSE com reconciliaçao duravel; no v1 atual o HTTP de turno e assincrono para o Boobot, mas aguarda a resposta do servidor.
3. Implementar adaptador OpenCode v2 separado; nao tratar o contrato v1 como compativel automaticamente.
4. Testar com um modelo externo autorizado pelo usuario, preferencialmente gratuito com licenca para acesso via SDK, sem ativar modelos pagos sem aprovacao.
5. Testar cancelamento, reinicio e edicoes reais na UI e medir latencia de primeira resposta.

**Uso:** no momento o adaptador v1 e experimental; manter supervisao e aprovacao de arquivos/terminal.

## Smoke real reproduzivel
Rode em PowerShell: $env:BOOBOT_LIVE_OPENCODE='1'; npx vitest run src/main/v9/opencode-server.live.test.ts --maxWorkers=1. O teste apenas inicia o servidor e cria/retoma sessao, nao executa inferencia paga.
