# Boobot — estabilização e validação de 19/10/2026

Estado local da aplicação em `apps/desktop`. Este relatório registra verificações desta sessão, sem commit nem push. Há outras mudanças locais preexistentes: não confundir esta revisão com uma certificação integral do produto.

## Fila B09 e exclusividade de workspace

A árvore de concessões da `WorkspaceQueue`, incluindo o tratamento de pai → filho → neto e dois pais simultâneos, já estava presente como alteração local ao iniciar esta sessão. Testes iniciais: 12 aprovados (6 em `queue-delegation.test.ts`, 6 em `routing.test.ts`).

Uma regressão adicional identificou concorrência indevida: se um filho retornava deixando um neto executando sem aguardar, o próximo irmão começava a trabalhar na mesma pasta antes do neto terminar. Foi reproduzida como falha antes da correção. Em `routing.ts`, `executeScope` agora aguarda `scope.tail` no `finally`, impedindo a liberação da concessão antes de encerrar seus descendentes. Regressão adicionada a `queue-delegation.test.ts`. **13 testes direcionados passaram** após a correção.

## Verificações

- Suíte geral serial (`npx vitest run --maxWorkers=1`): **348 aprovados, 14 condicionais ignorados**, 67 arquivos aprovados e 10 arquivos só com condicionais ignorados. Essa execução iniciou antes da última alteração no teste condicional de sandbox; este é ignorado sem variável explícita.
- `npm run typecheck`: aprovado.
- `npm run build`: aprovado. Avisos não fatais do bundler sobre diretivas `use client` do framer-motion.
- `npm run lint -- --format json`: falha, com maior concentração em `chief-tools.test.ts`, `store.ts`, `v9-multi-runtime.test.ts`, `v9-delegation.test.ts` e `workspace.ts`. Dívida de lint não solucionada.
- Teste real Pi sem inferência (`POLITRON_PI_LIVE_SMOKE=1`): **2 aprovados**, descoberta de modelos e abertura/fechamento da sessão RPC. Não certifica edição de arquivos.
- Testes de OpenCode/Antigravity existentes validam criação de sessão/normalização de eventos, **não edição real**.

## Limitação crítica de sandbox

A sonda opcional do sandbox nativo do Codex no Windows, em diretórios TEMP descartáveis (`BOOBOT_RUN_SANDBOX_PROBE=1`), retornou **`windows sandbox: helper_unknown_error: setup refresh had errors`**. Nem a escrita interna nem a externa ocorreram. Isso é **indisponibilidade do sandbox, não evidência de isolamento**.

O teste `terminal-sandbox.live.test.ts` tinha falso positivo: verificava somente que não houve escrita externa. Foi corrigido para exigir execução efetiva e escrita autorizada interna, além do bloqueio externo. Assim, a sonda condicional deve falhar enquanto o sandbox não iniciar. O terminal próprio `workspace_run_command` continua sem confinamento de sistema operacional; sua permissão e aprovação por comando não substituem sandbox. Não substituir proteção real por filtro textual, `cwd` ou aprovação.

## Próximos passos

1. Certificar B09 com agentes reais em dois workspaces descartáveis e três níveis de delegação; observar estado final e cancelamento.
2. Investigar o erro de inicialização do sandbox Windows; só habilitar execução restrita após teste real positivo. Para comandos sem sandbox, manter autorização explícita e o alerta de ausência de confinamento.
3. Tratar os erros de ESLint em lotes e medir as flutuações dos testes Git/workspaces sem simplesmente aumentar timeouts.
4. Certificar a capacidade de edição, aprovação e cancelamento separadamente para Pi, OpenCode e Antigravity.
5. Verificar a nova experiência com Electron visualmente e realizar um teste prolongado com vários agentes.

Nenhum dado do usuário, configuração de voz ou outros projetos foi intencionalmente modificado.
