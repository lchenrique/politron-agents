# OpenCode servidor v1 — migracao fase 1

Data: 22/10/2026. Referencia: https://github.com/getpaseo/paseo/blob/main/docs/providers.md

## Concluido
- Integracao `OpenCodeServerRuntime` por servidor nativo, reutilizado entre Boos e workspaces.
- O processo inicia `opencode serve --pure --hostname 127.0.0.1 --port 0`, com senha aleatoria e Basic Auth, somente loopback.
- Criacao e retomada de sessoes reais via HTTP (/session); modelo no formato provider/model; catalogo via /provider.
- Contexto e estado mantidos no servidor entre chamadas ao broker de ferramentas, sem reiniciar a CLI por acao.
- Streaming SSE de texto para conversas sem ferramentas, reconexao e reconciliacao com resposta HTTP.
- Catálogo de ferramentas nativas permanece visível ao OpenCode Zen, mas toda ação exige permissão `ask`; solicitações nativas recebidas pelo SSE são recusadas via endpoint HTTP. MCP e plugins herdados são desativados; ferramentas autorizadas do Boobot continuam passando exclusivamente pelo broker.
- Cancelamento em /session/{id}/abort, timeout e falhas de servidor terminalizam turnos.
- Adaptador anterior preservado por `BOOBOT_OPENCODE_TRANSPORT=cli` (definido antes de iniciar Boobot).
- Verificacao de versao: adaptador implementa v1; v2 deve ter integracao propria.
- Voz nao foi alterada.

## Validacao
- OpenCode instalado na maquina: 1.18.35.
- A configuração anterior (`permission: deny` e `tools: {'*':false}`) causava recusas do Zen gratuito. A origem foi reproduzida em problemas upstream (#50627 e #51315); o catálogo não pode ser removido daquela forma.
- Depois da correção, testes reais de geração via servidor local autenticado passaram com `opencode/big-pickle` (25,7 s) e `opencode/mimo-v2.6-flash-free` (21,7 s), ambos com saída `ZEN_OK`. Isso não certifica edição de arquivos, segurança completa nem a paridade de ferramentas do Paseo.
- Cinco testes unitários do servidor passaram, incluindo recusa HTTP de permissão nativa no cenário simulado. O teste real que pediu uso de bash não criou arquivo, mas o modelo não tentou usar ferramentas (`permissionRequests=0`); por isso **a proteção em execução real segue pendente de certificação**.
- Teste com HTTP simulado verificou duas interacoes de ferramenta na mesma sessao, streaming SSE sem repeticao, isolamento de ferramentas, recuperacao de sessao e falha se sessao nao existir.
- Build, typecheck e regressao passaram na fase 1 (verificar as execucoes mais recentes).

## Pendencias
1. Migrar o broker textual JSON para ferramentas nativas integradas por plugin com permissao por sessao, como o Paseo faz no v1. Nao disponibilizar comandos nativos sem essa mediacao.
2. Migrar `POST /session/{id}/message` para `prompt_async` e eventos SSE com reconciliaçao duravel; no v1 atual o HTTP de turno e assincrono para o Boobot, mas aguarda a resposta do servidor.
3. Implementar adaptador OpenCode v2 separado; nao tratar o contrato v1 como compativel automaticamente.
4. Ampliar a validação para outros modelos gratuitos oficialmente disponíveis e para ferramentas com aprovação real; não ativar modelos pagos sem aprovação.
5. Testar cancelamento, reinicio e edicoes reais na UI e medir latencia de primeira resposta.

**Uso:** no momento o adaptador v1 e experimental; manter supervisao e aprovacao de arquivos/terminal.

## Smoke real reproduzivel
Rode em PowerShell: $env:BOOBOT_LIVE_OPENCODE='1'; npx vitest run src/main/v9/opencode-server.live.test.ts --maxWorkers=1. O teste apenas inicia o servidor e cria/retoma sessao, nao executa inferencia paga.

## Fase 2 — ponte nativa Boobot (22/10/2026)
- Implementado plugin nativo do OpenCode v1, compilado localmente com esbuild e carregado por URL file:// em processo autenticado. As ferramentas expostas são boobot_tools (catálogo da sessão) e boobot_call (nome e argumentos JSON). Esta primeira implementação usa ferramenta despachante tipada, não registra uma assinatura nativa distinta por ferramenta; isso ainda pode ser melhorado.
- O processo não usa --pure porque --pure suprime plugins externos. Para manter isolamento, usa OPENCODE_CONFIG_DIR separado, OPENCODE_DISABLE_PROJECT_CONFIG=1 e OPENCODE_CONFIG_CONTENT contendo somente o plugin Boobot. Não compartilha plugins nem diretórios de configuração do usuário.
- Ponte HTTP de loopback com token aleatório, autorização de sessão e turno ativo, whitelist por agente, limite de payload de 1 MB, timeout de execução e rejeição explícita. O broker WorkspaceService continua responsável por autorização, aprovações e execução real.
- As ferramentas nativas do OpenCode conservam permissão ask, com resposta de rejeição às solicitações capturadas no SSE. O modelo não recebe autorização genérica para bash/read/write. Chamada de ferramenta aprovada no broker é devolvida nativamente durante o turno; cancelamentos encerram esperas pendentes.
- Teste real com modelo gratuito opencode/big-pickle: uma chamada group_members foi disparada pelo plugin, processada pelo evento do broker e o resultado Íris QA foi usado na resposta final. Aproximadamente 86,5 s com modelo remoto gratuito; é prova do transporte, não benchmark de latência ou teste de escrita em arquivos.
- Testes unitários cobrem token, sessão, whitelist, JSON inválido, resultado do broker e rejeição de solicitação nativa; TypeScript passou. O build Electron foi iniciado para verificação de empacotamento.
- Pendências: autenticar por teste E2E com aprovações reais do WorkspaceService no Electron, verificar proteção contra configurações globais de plugins em outros sistemas, registrar ferramentas individuais por esquema no plugin (paridade completa com Paseo) e testar edição real/negação/cancelamento pela UI antes de considerar a integração pronta para uso sem supervisão.
