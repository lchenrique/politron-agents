# Politron - OpenCode SDK Integration Plan

## TL;DR

> **Objetivo**: Integrar `@opencode-ai/sdk` no main process do Electron
>
> **Entregas**: SDK configurado, serviço de sessões, IPC para renderer
>
> **Esforço**: Alto
> **Execução Paralela**: NÃO - sequencial com dependências

---

## Contexto

### O que existe
- Electron app com `apps/desktop/` funcional
- Main process com janela frameless e titlebar
- Preload com `window.vibeAPI` exposto
- Renderer React com UI mockada do IDE
- Arquivo placeholder `services/opencode-sdk.ts` (vazio)

### O que precisa ser feito
1. Instalar `@opencode-ai/sdk` e tipos
2. Configurar cliente SDK no main process
3. Criar `OpenCodeSdkService` com gerenciamento de sessões
4. Implementar handlers IPC para operações de agente
5. Adicionar eventos de streaming (vibe:agent:chunk, status, done, error)
6. Criar sessão do CEO global
7. Testar integração básica

### SDK do OpenCode
- `createOpencode()` inicia servidor + cliente automaticamente
- Não precisa rodar servidor separado
- Tipos em `@opencode-ai/sdk/v2/client`

---

## Work Objectives

### Objetivo Principal
Main process conectando ao OpenCode SDK, gerenciando sessões de agentes e expondo funcionalidades via IPC

### Entregas Concretas
- [ ] SDK instalado e importado corretamente
- [ ] `OpenCodeSdkService` com ensureSession, sendMessage, subscribe
- [ ] Sessão do CEO global criada automaticamente
- [ ] Handlers IPC para vibe:agent:* e vibe:ceo:*
- [ ] Eventos de streaming funcionando
- [ ] Teste: criar sessão e enviar mensagem

---

## Excluded from Scope (Guardrails)
- NÃO implementar lógica de teams/pipeline ainda (só sessão mockada)
- NÃO migrar React Router → TanStack Router ainda
- NÃO migrar Context → Jotai ainda
- NÃO configurar monorepo Turborepo ainda
- NÃO implementar git worktrees ainda

---

## Execution Strategy

### Estrutura alvo
```
apps/desktop/src/main/
├── index.ts                    # Main process (JA EXISTE)
├── ipc/
│   └── handlers.ts            # Handlers IPC (EXPANDIR)
├── services/
│   ├── opencode-sdk.ts        # SDK service (EXPANDIR)
│   └── session-store.ts       # Gerenciamento de sessões
└── windows/
    └── manager.ts             # Window manager (JA EXISTE)

apps/desktop/src/preload/
└── index.ts                   # vibeAPI (EXPANDIR)
```

### Dependências
```
Instalar SDK → Configurar cliente → Criar serviço → Adicionar handlers IPC → Testar
```

---

## TODOs

- [x] 1. Instalar `@opencode-ai/sdk` e tipos

  **What to do**:
  - Adicionar `@opencode-ai/sdk` como dependência em `apps/desktop/package.json`
  - Verificar se existem tipos separados ou se estão inclusos
  - Rodar `npm install`

  **References**:
  - SPEC-02-opencode-integration.md
  - AGENT.md - "Sempre preferir tipos de `@opencode-ai/sdk/v2/client`"

  **Acceptance Criteria**:
  - [x] `@opencode-ai/sdk` instalado em `apps/desktop/node_modules`
  - [x] Importação funciona: `import { createOpencode } from '@opencode-ai/sdk'`

- [x] 2. Criar `apps/desktop/src/main/services/session-store.ts`

  **What to do**:
  - Criar store para gerenciar sessões ativas
  - Interface `ManagedSession` com agentId, teamId, role, session, status
  - Métodos: getSession, setSession, removeSession, listSessions

  **References**:
  - SPEC-02-opencode-integration.md - "Modelo de sessão local"

  **Acceptance Criteria**:
  - [x] ManagedSession interface definida
  - [x] Map de sessões gerenciado
  - [x] Thread-safe para main process

- [x] 3. Implementar `apps/desktop/src/main/services/opencode-sdk.ts`

  **What to do**:
  - Implementar `OpenCodeSdkService`
  - Método `ensureSession(input)` - cria ou retoma sessão
  - Método `sendMessage(input)` - envia mensagem para agente
  - Método `subscribeToSession(agentId)` - stream de eventos
  - Método `subscribeToGlobalEvents()` - eventos globais CEO
  - Método `stopSession(agentId)` - encerra sessão

  **References**:
  - SPEC-02-opencode-integration.md - "Serviço de integração"

  **Acceptance Criteria**:
  - [x] OpenCodeSdkService interface implementada
  - [x] Cliente SDK inicializado
  - [x] Gerenciamento de sessões funcional

- [x] 4. Expandir `apps/desktop/src/main/ipc/handlers.ts`

  **What to do**:
  - Adicionar handlers para operações de agente:
    - `vibe:agent:ensure` - cria/obtem sessão de agente
    - `vibe:agent:send` - envia mensagem
    - `vibe:agent:stop` - encerra sessão
    - `vibe:agent:subscribe` - inicia stream de eventos
  - Adicionar handlers para CEO:
    - `vibe:ceo:ensure` - cria/obtem sessão do CEO global
    - `vibe:ceo:send` - envia mensagem para CEO
    - `vibe:ceo:subscribe` - stream de eventos do CEO

  **References**:
  - SPEC-02-opencode-integration.md - "Contratos de mensagem"
  - SPEC-01-architecture.md - "Padrão de nomes IPC"

  **Acceptance Criteria**:
  - [x] Todos os handlers registrados
  - [x] Nomenclatura segue padrão `vibe:{domínio}:{ação}`
  - [x] Tipos IPC corretos

- [x] 5. Expandir `apps/desktop/src/preload/index.ts`

  **What to do**:
  - Adicionar à API exposta:
    - `ceo: { ensure, send, subscribe }`
    - `agent: { ensure, send, stop, subscribe }`
  - Tipar corretamente usando tipos do SDK

  **References**:
  - SPEC-01-architecture.md - "Expor window.vibeAPI"
  - SPEC-02-opencode-integration.md - "O renderer recebe apenas eventos"

  **Acceptance Criteria**:
  - [x] window.vibeAPI.agent.* disponível
  - [x] window.vibeAPI.ceo.* disponível
  - [x] Tipos corretos

- [x] 6. Criar inicialização do CEO global

  **What to do**:
  - No `whenReady()` do main, criar sessão do CEO global
  - Usar system prompt do CEO definido em vibecoding-ide-prompt.md
  - Manter sessão persistente durante vida do app

  **References**:
  - vibecoding-ide-prompt.md - "System prompt base do CEO global"
  - SPEC-02-opencode-integration.md - "CEO global tem sessão própria"

  **Acceptance Criteria**:
  - [x] CEO global sessão criada na inicialização
  - [x] System prompt aplicado corretamente
  - [x] Sessão persiste até app fechar

- [ ] 7. Teste de integração básica

  **What to do**:
  - Build do app
  - Verificar que SDK inicializa sem erros
  - Verificar que IPC handlers respondem
  - Log básico no console do main

  **References**:
  - npm run dev para testar

  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds
  - [ ] `npm run dev` inicia sem erros de SDK
  - [ ] Logs mostram inicialização do SDK

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm install && npm run build
```

### Success Criteria
- [ ] SDK importado sem erros
- [ ] OpenCodeSdkService implementado
- [ ] CEO global sessão criada na inicialização
- [ ] IPC handlers para agent e ceo funcionam
- [ ] Build passa sem erros
- [ ] Dev server inicia sem erros de SDK

---

## Final Verification Wave

- [x] F1. **SDK Import Test** — Verificar que `@opencode-ai/sdk` importa e inicializa
- [x] F2. **Service Test** — Verificar que OpenCodeSdkService funciona
- [x] F3. **IPC Test** — Verificar que handlers IPC estão registrados
- [x] F4. **Build Test** — `npm run build` compila sem erros

---

## Success Criteria

1. SDK integra sem erros de tipo
2. OpenCodeSdkService gerencia sessões corretamente
3. CEO global tem sessão própria na inicialização
4. Renderer pode enviar/receber mensagens via IPC
5. Build passa e dev server inicia

---

## Next Phases (NOT in this plan)

- Implementar times e tech leads reais
- Implementar pipeline de tarefas
- Configurar Turborepo monorepo
- Migrar React Router → TanStack Router
- Migrar Context → Jotai
- Implementar git worktrees

(End of file - total 285 lines)
