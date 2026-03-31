# Politron - Teams & Tech Leads Plan

## TL;DR

> **Objetivo**: Implementar times com tech leads e pipeline local no Electron app
>
> **Entregas**: Team management, pipeline de tarefas, IPC handlers completos
>
> **Esforço**: Alto
> **Execução Paralela**: NÃO - sequencial com dependências

---

## Contexto

### O que existe
- SDK integrado com OpenCode (`openCodeSdkService`)
- CEO global sessão criada na inicialização
- IPC handlers para vibe:agent:* e vibe:ceo:*
- Preload API com agent/ceo métodos

### O que precisa ser feito
1. Criar tipos e interfaces para Team, Agent, Pipeline
2. Criar TeamStore para gerenciar times
3. Expandir IPC handlers para team operations
4. Implementar pipeline local (executor de tasks)
5. Adicionar handlers para pipeline
6. Expandir preload API com team/pipeline métodos
7. Conectar UI de teams ao backend

---

## Work Objectives

### Objetivo Principal
Sistema de times com tech lead e pipeline funcional no main process

### Entregas Concretas
- [x] Tipos TypeScript para Team, Agent, Pipeline definidos
- [x] TeamStore para gerenciar times em memória
- [x] IPC handlers: vibe:team:create, vibe:team:hire, vibe:team:setTechLead
- [x] IPC handlers: vibe:pipeline:*, vibe:task:*
- [x] Preload API expandida com team/pipeline métodos
- [ ] UI de TeamsSidebar conectada ao backend (NOT in scope for this plan)

---

## Excluded from Scope (Guardrails)
- NÃO implementar git worktrees ainda (SPEC-04)
- NÃO migrar React Router → TanStack Router ainda
- NÃO migrar Context → Jotai ainda
- NÃO implementar templates de times ainda (MVP)
- NÃO implementar parsing de output estruturado do CEO ainda

---

## Execution Strategy

### Estrutura alvo
```
apps/desktop/src/main/
├── index.ts                    # (JA EXISTE)
├── ipc/
│   └── handlers.ts           # (EXPANDIR) - team/pipeline handlers
├── services/
│   ├── opencode-sdk.ts       # (JA EXISTE)
│   ├── session-store.ts       # (JA EXISTE)
│   ├── team-store.ts         # (NOVO) - gerenciar times
│   └── pipeline-executor.ts  # (NOVO) - executar pipeline local
└── types/
    └── team.ts               # (NOVO) - tipos Team, Agent, Pipeline

apps/desktop/src/preload/
└── index.ts                  # (EXPANDIR) - team/pipeline API
```

---

## TODOs

- [x] 1. Criar `apps/desktop/src/main/types/team.ts`

  **What to do**:
  - Definir tipos: `AgentStatus`, `Agent`, `Team`, `Workspace`, `PipelineState`, `PipelineTask`, `TeamTemplate`
  - Tipos devem seguir SPEC-03-teams-pipeline.md

  **References**:
  - SPEC-03-teams-pipeline.md - "Modelo de dados"

  **Acceptance Criteria**:
  - [x] Todos os tipos do SPEC-03 definidos
  - [x] Exports corretos

- [x] 2. Criar `apps/desktop/src/main/services/team-store.ts`

  **What to do**:
  - Criar TeamStore class para gerenciar times
  - Métodos: createTeam, getTeam, deleteTeam, addAgentToTeam, removeAgentFromTeam, setTechLead, pauseTeam, resumeTeam
  - Manter times em Map
  - Events para mudanças de estado

  **References**:
  - SPEC-03-teams-pipeline.md - "Criação de time"

  **Acceptance Criteria**:
  - [x] TeamStore funcional
  - [x] Métodos CRUD de teams
  - [x] Gerenciamento de agentes no team

- [x] 3. Criar `apps/desktop/src/main/services/pipeline-executor.ts`

  **What to do**:
  - Criar PipelineExecutor para executar tasks localmente
  - Métodos: addTask, startTask, completeTask, failTask, blockTask
  - Avaliar dependências antes de executar
  - Verificar conflitos de arquivos
  - Notificar quando bloco terminar

  **References**:
  - SPEC-03-teams-pipeline.md - "Executor de pipeline local"

  **Acceptance Criteria**:
  - [x] PipelineExecutor implementa lógica de dependências
  - [x] Gerencia status de tasks
  - [x] Detecta conflitos de arquivos

- [x] 4. Expandir IPC handlers para teams

  **What to do**:
  - Adicionar handlers:
    - `vibe:team:create` - criar novo time
    - `vibe:team:delete` - deletar time
    - `vibe:team:get` - obter time
    - `vibe:team:list` - listar todos
    - `vibe:team:hire` - contratar agente
    - `vibe:team:fire` - dispensar agente
    - `vibe:team:setTechLead` - definir tech lead
    - `vibe:team:pause` - pausar time
    - `vibe:team:resume` - resumir time

  **References**:
  - SPEC-01-architecture.md - "Padrão de nomes IPC"

  **Acceptance Criteria**:
  - [ ] Todos handlers registrados
  - [ ] Nomenclatura segue padrão vibe:team:*

- [x] 5. Expandir IPC handlers para pipeline

  **What to do**:
  - Adicionar handlers:
    - `vibe:pipeline:addTask` - adicionar task
    - `vibe:pipeline:start` - iniciar pipeline
    - `vibe:pipeline:pause` - pausar
    - `vibe:pipeline:resume` - continuar
    - `vibe:pipeline:getStatus` - status atual
    - `vibe:task:complete` - completar task
    - `vibe:task:fail` - falhar task

  **References**:
  - SPEC-03-teams-pipeline.md - "Executor de pipeline local"

  **Acceptance Criteria**:
  - [ ] Pipeline handlers funcionais
  - [ ] Events emitidos para renderer

- [x] 6. Expandir preload API para teams/pipeline

  **What to do**:
  - Adicionar API:
    - `team: { create, delete, get, list, hire, fire, setTechLead, pause, resume }`
    - `pipeline: { addTask, start, pause, resume, getStatus }`
    - `onTeamUpdate` - callback para mudanças de team
    - `onPipelineUpdate` - callback (já existe, expandir)

  **References**:
  - IPC handlers criados na task 4 e 5

  **Acceptance Criteria**:
  - [ ] window.vibeAPI.team.* disponível
  - [ ] window.vibeAPI.pipeline.* disponível

- [x] 7. Testar integração básica

  **What to do**:
  - Build do app
  - Verificar que IPC handlers respondem
  - Log de team operations no console

  **References**:
  - npm run dev para testar

  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds
  - [ ] Team operations não dão erro

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm run build
```

### Success Criteria
- [ ] Tipos TypeScript definidos corretamente
- [ ] TeamStore gerencia times
- [ ] PipelineExecutor avalia dependências
- [ ] IPC handlers para team/pipeline funcionam
- [ ] Preload API expõe team/pipeline métodos
- [ ] Build passa sem erros

---

## Final Verification Wave

- [x] F1. **Types Test** — Verificar tipos em types/team.ts ✅
- [x] F2. **Store Test** — Verificar TeamStore funciona ✅
- [x] F3. **IPC Test** — Verificar handlers registrados ✅
- [x] F4. **Build Test** — `npm run build` compila sem erros ✅

---

## Success Criteria

1. Times podem ser criados, deletados, pausados, resumidos
2. Agentes podem ser contratados e dispensados
3. Tech lead pode ser definido
4. Pipeline de tasks funciona com dependências
5. UI da TeamsSidebar responde às operações

---

## Next Phases (NOT in this plan)

- Implementar git worktrees
- ~~Migrar React Router → TanStack Router~~ (NÃO - manter React Router, sem gain prático)
- Migrar Context → Jotai
- Implementar templates de times
- Implementar parsing de output estruturado do CEO

(End of file - total 238 lines)
