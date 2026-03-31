# Politron - CEO Output Parsing Plan

## TL;DR

> **Objetivo**: Parsear output estruturado do CEO para executar ações (criar teams, delegar tasks, etc.)
>
> **Entregas**: Parser que detecta comandos do CEO e executa ações correspondentes
>
> **Esforço**: Médio
> **Execução Paralela**: NÃO

---

## Contexto

### O que existe
- CEO é inicializado no startup com role "global-ceo"
- CEO produz output via `message.updated` events (texto streamado)
- IPC handlers para teams, agents, pipelines já existem
- O CEO é "bobo" - só fala, não executa ações

### O que precisa ser feito
1. Definir formato de comandos que o CEO pode outputar
2. Criar parser que detecta comandos no texto
3. Criar executor que chama IPC handlers baseado nos comandos
4. Integrar parser com o event stream do SDK

### Comandos do CEO (sugeridos)
```
[CREATE_TEAM] name: "X" template: "mvp-startup"
[DELEGATE] team: "X" task: "implementar login"
[HIRE_AGENT] team: "X" role: "frontend"
[PAUSE_TEAM] team: "X"
[RESUME_TEAM] team: "X"
[ASK_HUMAN] question: "qual cor para o botão?"
```

---

## Modelagem de Dados

### CeoCommand
```typescript
type CeoCommandType = 
  | "CREATE_TEAM"
  | "DELEGATE"
  | "HIRE_AGENT"
  | "PAUSE_TEAM"
  | "RESUME_TEAM"
  | "ASK_HUMAN"

interface CeoCommand {
  type: CeoCommandType
  payload: Record<string, string | string[]>
  raw: string  // texto original para debug
}
```

### Parser Output
```typescript
interface ParsedCeoOutput {
  commands: CeoCommand[]
  remainingText: string  // texto que não é comando
}
```

---

## TODOs

- [x] 1. Criar tipo CeoCommand e CeoCommandType em types/ceo.ts

  **What to do**:
  - Criar `apps/desktop/src/main/types/ceo.ts`
  - Definir CeoCommandType enum
  - Definir CeoCommand interface
  - Definir ParsedCeoOutput interface

  **References**:
  - session-store.ts para AgentRole
  - team.ts para Team/Agent types

  **Acceptance Criteria**:
  - [x] CeoCommandType com todos os tipos de comando
  - [x] CeoCommand com type, payload, raw

- [x] 2. Criar CeoOutputParser service

  **What to do**:
  - Criar `apps/desktop/src/main/services/ceo-output-parser.ts`
  - Método `parse(output: string): ParsedCeoOutput`
  - Regex para detectar padrões [COMMAND] ...
  - Fallback para texto livre

  **References**:
  - Tipos do task 1

  **Acceptance Criteria**:
  - [x] Detecta [CREATE_TEAM], [DELEGATE], etc.
  - [x] Extrai parâmetros corretamente
  - [x] Retorna remainingText para texto livre

- [x] 3. Criar CeoCommandExecutor service

  **What to do**:
  - Criar `apps/desktop/src/main/services/ceo-command-executor.ts`
  - Método `execute(command: CeoCommand): Promise<void>`
  - Switch por tipo de comando
  - Chama handlers internos (teamStore, etc.)

  **References**:
  - team-store.ts para operações de team
  - pipeline-executor.ts para delegação

  **Acceptance Criteria**:
  - [x] CREATE_TEAM cria team via TeamStore
  - [x] DELEGATE adiciona task ao pipeline
  - [x] ASK_HUMAN emite evento para UI

- [x] 4. Integrar parser com SDK event handling

  **What to do**:
  - Modificar opencode-sdk.ts para usar parser
  - No event `message.updated`, append ao buffer
  - No event `session.idle`, fazer parse completo
  - Após parse, executar comandos via CeoCommandExecutor

  **References**:
  - opencode-sdk.ts handleSdkEvent()

  **Acceptance Criteria**:
  - [x] CEO output é passado pelo parser
  - [x] Comandos são executados automaticamente
  - [x] Eventos emitidos para UI (ASK_HUMAN)

- [x] 5. Adicionar evento para ASK_HUMAN no preload

  **What to do**:
  - Adicionar `onCeoAskHuman` callback no preload
  - Handler emite evento quando CEO precisa de input

  **References**:
  - preload/index.ts para padrões de eventos

  **Acceptance Criteria**:
  - [x] window.vibeAPI.onCeoAskHuman(callback)
  - [x] UI pode mostrar dialog para usuário

- [x] 6. Testar build

  **What to do**:
  - `npm run build`

  **Acceptance Criteria**:
  - [x] Build succeeds

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm run build
```

### Success Criteria
- [ ] CEO output é parseado corretamente
- [ ] Comandos são executados sem erro
- [ ] Build passa

---

## Final Verification Wave

- [x] F1. **Types Test** — CeoCommand types
- [x] F2. **Parser Test** — regex detection
- [x] F3. **Executor Test** — command execution
- [x] F4. **Build Test** — npm run build

---

## Next Phases (NOT in this plan)

- UI de TeamsSidebar conectada ao backend
