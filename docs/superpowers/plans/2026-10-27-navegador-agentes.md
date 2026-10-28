# Navegador dos agentes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agente usa o navegador interno sem compartilhamento manual e, com autorização única por conversa+agente, usa o navegador real do usuário pela extensão oficial (Codex e Claude).

**Architecture:** `PlatformBrowser` (main) ganha `acquireForAgent`, que pede ao renderer para revelar a aba `web`, espera a view ficar visível e concede o compartilhamento sem clique. O fail-closed do `ExternalBrowserProxy` sai; o proxy passa a ser registrado sempre que a sonda da ponte não acusa problema, e o grant (não mais aprovação por chamada) decide se cada `js` é encaminhado. `ClaudeRuntime` recebe o proxy como servidor MCP HTTP, igual ao Codex.

**Tech Stack:** Electron 40, TypeScript, React 19, Vitest, `@modelcontextprotocol/sdk`, `@anthropic-ai/claude-agent-sdk`.

**Spec:** `docs/superpowers/specs/2026-10-27-navegador-agentes-design.md`

## Global Constraints

- Comandos em `apps/desktop`: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- Textos de UI e mensagens em PT-BR com acentuação correta.
- Canais novos ficam fora da PWA/RPC de hosts (`main/hosts/rpc.ts` não ganha nada); `isMainSender` protege IPC novo.
- Nunca registrar o `node_repl` oficial direto na thread; só o proxy `politron_external_browser`.
- Flags `browser_use*`/`computer_use` em `codex.ts` continuam desligadas.
- Grant continua em `v9_meta`, chave `external_browser:<conversa>:<agente>`.
- Ações no navegador interno (open/click/fill/scroll) continuam com `requestApproval` por ação.

## Review Focus

- Usuário revoga o compartilhamento interno durante uma execução: chamada seguinte do mesmo agente deve falhar com mensagem de bloqueio, não recompartilhar.
- Usuário troca de conversa enquanto o agente navega: o compartilhamento do momento cai (como hoje); a próxima chamada `browser_*` reabre a aba e recompartilha, desde que o usuário não tenha revogado.
- Dois agentes disputando o navegador interno: o que tem execução ativa mantém; o outro recebe "navegador em uso por <agente> em <conversa>".
- Revogar o navegador real no meio da execução: chamadas `js` seguintes são recusadas, nada encaminhado.
- Ponte quebrada (caso desta máquina): agente não recebe o proxy, `external_browser_status` explica o motivo e o interno segue funcionando.

---

### Task 1: `PlatformBrowser.acquireForAgent` e bloqueio por revogação

**Files:**
- Modify: `apps/desktop/src/main/ipc/platform-browser.ts`
- Modify: `apps/desktop/src/shared/platform-browser.ts` (tipo do evento reveal)
- Test: `apps/desktop/src/main/ipc/platform-browser.test.ts`

**Interfaces:**
- Produces:
  - `acquireForAgent(owner: PlatformBrowserOwner, url?: string, timeoutMs = 5000): Promise<void>`: lança `'Compartilhamento do navegador bloqueado pelo usuário nesta conversa.'` se `owner` está bloqueado; cria a view (`ensure`), define `context = owner`, envia `host.webContents.send('platformBrowser:reveal', owner)`, aguarda `visible === true` até `timeoutMs` (senão lança `'A aba Navegador não pôde ser aberta.'`); se `url` válida, `navigate(url)` e aguarda `did-stop-loading`; se a URL atual não for http(s), lança `'Nenhuma página aberta: use browser_open primeiro.'`; por fim `sharing = owner`, `generation++`, `publish()`. Se `sharing` já é `owner` e tudo visível, retorna sem nada.
  - `revokeSharing(byUser = false)`: com `byUser`, adiciona o dono atual a `blocked: Set<string>` (chave `conversationId:agentId`).
  - `grantSharing(owner)`: remove `owner` de `blocked`.
  - `setSharingContext(owner)`: deixa de zerar o contexto quando `owner === null` e `sharing` pertence a um agente vindo de `acquireForAgent`? **Não**: mantém o comportamento atual (revoga). A recuperação vem da próxima `acquireForAgent`.
  - IPC `platformBrowser:revokeSharing` passa `byUser = true`.

- [ ] **Step 1: Testes que falham** em `platform-browser.test.ts` (usar os fakes de host/view já existentes no arquivo):
  - `acquireForAgent envia reveal, espera visível e compartilha`: host fake registra `send('platformBrowser:reveal', owner)`; simular `setBounds({...}, true)` após o envio; `await acquireForAgent(owner, 'https://example.com/')`; `expect(browser.sharingState()).toEqual(owner)`.
  - `acquireForAgent sem página lança orientação`: sem url e view em `about:blank` → rejeita com `/use browser_open primeiro/`.
  - `revogação pelo usuário bloqueia acquire até novo grantSharing`: após acquire, `revokeSharing(true)`; `acquireForAgent(owner)` rejeita com `/bloqueado pelo usuário/`; `setSharingContext(owner); grantSharing(owner)` → acquire volta a funcionar.
  - `timeout quando a aba não aparece`: nunca chamar `setBounds` visível, `timeoutMs = 50` → rejeita com `/não pôde ser aberta/`.
- [ ] **Step 2:** `npx vitest run src/main/ipc/platform-browser.test.ts` → FAIL (método inexistente).
- [ ] **Step 3:** Implementar conforme Interfaces. Espera de visibilidade/carga: Promise resolvida em `setBounds` visível / evento `did-stop-loading`, com `setTimeout` de rejeição.
- [ ] **Step 4:** Mesmo comando → PASS; rodar também `platform-browser-dom.test.ts`.
- [ ] **Step 5:** Commit `feat(browser): agente adquire o navegador interno sem clique`.

### Task 2: Renderer revela a aba e reflete o agente compartilhado

**Files:**
- Modify: `apps/desktop/src/preload/index.ts` (`onReveal`), `apps/desktop/src/shared/platform-browser.ts` (`PlatformBrowserAPI.onReveal`), `apps/desktop/src/renderer/src/vite-env.d.ts` se necessário
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.tsx` (assina `onReveal` → `dockRef.current?.revealTool('web')`, só fora de `browserMode`)
- Modify: `apps/desktop/src/renderer/src/features/panels/PlatformBrowserPanel.tsx`
- Test: `PlatformBrowserPanel.test.tsx`, `renderer/src/test/preload-bridge.test.ts`

**Interfaces:**
- Consumes: evento `platformBrowser:reveal` (payload `PlatformBrowserOwner`) da Task 1.
- Produces: `platformBrowserAPI.onReveal(callback: (owner: PlatformBrowserOwner) => void): () => void`.

- [ ] **Step 1: Testes que falham:**
  - Panel: quando `state.sharing` tem `agentId` de um agente da conversa atual, o select "Agente para compartilhar" mostra esse agente e o botão é "Revogar compartilhamento".
  - Panel: quando `state.sharing` pertence a outra conversa, mostra o texto `Compartilhado com <agente> em outra conversa` e não chama `setSharingContext(null)` ao montar (para não derrubar o compartilhamento alheio). Usar `conversations`/`agents` passados como props; adicionar prop `conversationName?: (id: string) => string` se precisar do nome.
  - preload-bridge: `onReveal` existe e assina `platformBrowser:reveal`.
- [ ] **Step 2:** `npx vitest run src/renderer/src/features/panels/PlatformBrowserPanel.test.tsx src/renderer/src/test/preload-bridge.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. No Panel, `agentId` passa a ser inicializado de `state.sharing` quando `sharing.conversationId === conversationId`; o efeito `setSharingContext(owner)` só roda quando o usuário escolheu um agente ou quando não há `sharing` ativo de outra conversa.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(browser): aba Navegador abre sozinha quando o agente usa`.

### Task 3: Ferramentas `browser_*` usam `acquireForAgent`

**Files:**
- Modify: `apps/desktop/src/main/v9/workspace.ts:1342-1365` e descrições das tools `browser_*` (perto da linha 906)
- Test: `apps/desktop/src/main/v9/agent-interactions.test.ts` (ou o teste que já cobre `browser_*` com `PlatformBrowser` falso)

**Interfaces:**
- Consumes: `acquireForAgent(owner, url?)` da Task 1; `sharingState()`.
- Produces: `private browserBusyBy(owner): { agent: string; conversation: string } | null` em `workspace.ts`: retorna dono atual de `sharingState()` se diferente de `owner` **e** com execução ativa (`this.contexts` contém run desse conversa+agente não abortado).

- [ ] **Step 1: Testes que falham:**
  - `browser_open sem compartilhamento prévio adquire e abre`: `PlatformBrowser` falso registra `acquireForAgent(owner, 'https://example.com/')`; aprovação aceita; resultado do observe devolvido.
  - `browser_observe com navegador vazio orienta browser_open`: acquire falso lança a mensagem da Task 1 → tool rejeita com `/browser_open primeiro/`.
  - `navegador em uso por outro agente ativo`: `sharingState()` devolve outro owner com run ativo → rejeita com `/navegador em uso por .* em /`; sem run ativo → chama acquire normalmente.
- [ ] **Step 2:** `npx vitest run src/main/v9/agent-interactions.test.ts` → FAIL.
- [ ] **Step 3:** Antes de `captureDocument`: `browserBusyBy` → erro; `await activeBrowser.acquireForAgent(owner, name === 'browser_open' && !sharingAtivo ? text(args.url, 2000) : undefined)`. Quando o acquire já navegou para a URL do `browser_open`, pular `openForAgent` e devolver `observeForAgent`, mas **depois** da aprovação (a aprovação de `Abrir <url>` vem antes do acquire nesse caso). Descrições: `browser_open` diz que abre a aba Navegador automaticamente; ferramentas do interno são o padrão.
- [ ] **Step 4:** Mesmo comando + `npx vitest run src/main/v9` → PASS.
- [ ] **Step 5:** Commit `feat(browser): ferramentas do agente abrem e compartilham o navegador interno`.

### Task 4: Navegador real liberado por grant (fim do fail-closed)

**Files:**
- Modify: `apps/desktop/src/main/v9/external-browser-proxy.ts` (remove `EXTERNAL_BROWSER_JS_BLOCKED`, `externalBrowserCallViolation`; comentários de cabeçalho)
- Modify: `apps/desktop/src/main/v9/workspace.ts:76-134`, `:772`, `:906`, `:1366-1373`
- Test: `external-browser-proxy.test.ts`, `external-browser.test.ts` (usam `test-fixtures/fake-node-repl.mjs`)

**Interfaces:**
- Produces:
  - `externalBrowserStatus(owner)` → `problems` só com `probe()`.
  - `externalBrowserMcp(context)` roda para `runtime in ['codex','claude']`, sem exigir grant; exige `!planMode` e `problems.length === 0`.
  - `authorizeExternalBrowserCall(...)`: sem `requestApproval`; devolve `'O usuário não autorizou o navegador real para este agente nesta conversa. Use a ferramenta external_browser_request.'` sem grant, `null` com grant; mantém checagem de run ativo vinculado (runtime codex **ou** claude).
  - Nova tool `external_browser_request` (sem args): se já autorizado, retorna texto de já autorizado; senão `requestApproval(context, 'browser', { action: 'Permitir <agente> usar seu navegador real (Brave/Chrome) nesta conversa', task: 'O agente poderá ler e agir em qualquer site em que você está logado, incluindo cookies e dados salvos, até você revogar.' }, true, true)`; aprovado → `setExternalBrowserGrant(owner, true)`; retorna se a ponte está pronta.
  - `external_browser_status` passa a retornar texto (não lança) com `granted`, `problems` e instrução de correção quando a ponte está quebrada (`'reinstale o plugin Browser pelo Codex/ChatGPT'`).
  - Linha 772: chamar `externalBrowserMcp` para codex/claude independentemente do grant.

- [ ] **Step 1: Testes que falham** (ajustar os existentes que esperam fail-closed):
  - proxy: com authorizer devolvendo `null`, `tools/call js` chega ao node_repl falso e devolve o resultado dele.
  - proxy: authorizer devolvendo texto → `isError` com o texto; node_repl falso não recebe chamada.
  - workspace: sem grant, `js` via proxy → recusa citando `external_browser_request`; após `external_browser_request` aprovado, a mesma execução encaminha (sem nova thread).
  - workspace: `requestApproval` não é chamado nas chamadas `js` com grant.
  - workspace: revogar (`setExternalBrowserGrant(owner,false)`) → próxima `js` recusada.
  - workspace: agente `claude` recebe registro do proxy; `pi` não.
  - sonda com problema → `externalBrowserMcp` devolve `null` e `external_browser_status` cita o problema.
- [ ] **Step 2:** `npx vitest run src/main/v9/external-browser-proxy.test.ts src/main/v9/external-browser.test.ts` → FAIL.
- [ ] **Step 3:** Implementar. Revogação não fecha mais o proxy (ele recusa via authorizer); `closeExternalBrowserProxy` segue em apagar conversa/agente e no encerramento.
- [ ] **Step 4:** Mesmo comando → PASS.
- [ ] **Step 5:** Commit `feat(browser): navegador real liberado por autorização da conversa`.

### Task 5: Claude recebe o proxy MCP

**Files:**
- Modify: `apps/desktop/src/main/v9/claude.ts` (`thread(...)` aceita `externalBrowser?: ExternalBrowserRegistration` como o Codex; `request` adiciona o servidor)
- Test: `apps/desktop/src/main/v9/runtime-models.test.ts`

**Interfaces:**
- Consumes: `ExternalBrowserRegistration { url: string; token: string; tools: string[] }` (já usado em `codex.ts`).
- Produces: com registro, `options.mcpServers[EXTERNAL_BROWSER_MCP] = { type: 'http', url, headers: { Authorization: 'Bearer <token>' } }` e `allowedTools` inclui `mcp__politron_external_browser__<tool>` para cada tool; sem registro, opções idênticas às atuais.

- [ ] **Step 1: Teste que falha** em `runtime-models.test.ts`: thread com registro → `input.options.mcpServers.politron_external_browser` igual ao objeto acima e `allowedTools` contém `mcp__politron_external_browser__js`; sem registro → `mcpServers` só tem `politron`.
- [ ] **Step 2:** `npx vitest run src/main/v9/runtime-models.test.ts` → FAIL.
- [ ] **Step 3:** Implementar; `workspace.ts` já passa `externalBrowser` para `runtime.thread` (Task 4 garante para claude).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat(claude): agentes Claude usam o navegador real autorizado`.

### Task 6: Documentação e verificação final

**Files:**
- Modify: `docs/architecture.md` (seção do navegador: interno automático, navegador real por grant, fim do fail-closed com a decisão do usuário de 27/10/2026)

- [ ] **Step 1:** Atualizar a documentação.
- [ ] **Step 2:** Em `apps/desktop`: `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`. Esperado: typecheck e build exit 0; testes sem falha nova (falhas preexistentes conhecidas: `VoiceCall` intermitente, `Composer.test.tsx`); lint sem erro novo.
- [ ] **Step 3:** Commit `docs: navegador dos agentes interno automático e real por autorização`.
