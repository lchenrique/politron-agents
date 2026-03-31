# Politron - Git Worktrees Plan (SPEC-04)

## TL;DR

> **Objetivo**: Implementar git worktrees por time/agente e file locking
>
> **Entregas**: GitWorktreeService, FileLockManager, IPC handlers, Preload API
>
> **Esforço**: Alto
> **Execução Paralela**: NÃO - sequencial com dependências

---

## Contexto

### O que existe
- TeamStore para gerenciamento de times
- PipelineExecutor com dependências e branchName
- Agentes com status e currentFiles
- Tipos Team, Agent, PipelineTask

### O que precisa ser feito
1. Criar GitWorktreeService para operations de git
2. Criar FileLockManager para gerenciar locks
3. Expandir IPC handlers para worktree/lock
4. Expandir preload API
5. Integrar com PipelineExecutor

---

## Work Objectives

### Objetivo Principal
Cada agente opera em sua própria branch/worktree, com locks de arquivo para evitar conflitos

### Entregas Concretas
- [ ] GitWorktreeService com create/remove/list/merge
- [ ] FileLockManager com acquire/release/check
- [ ] IPC handlers: vibe:worktree:*, vibe:lock:*
- [ ] Preload API: worktree/lock methods
- [ ] Integração com PipelineExecutor

---

## Excluded from Scope (Guardrails)
- NÃO implementar merge automatizado via CEO (tech lead faz merge local)
- NÃO implementar resolução de conflitos automática
- NÃO implementar UI de git visualization

---

## Execution Strategy

### Estrutura alvo
```
apps/desktop/src/main/
├── index.ts                    # (JA EXISTE)
├── ipc/
│   └── handlers.ts           # (EXPANDIR) - worktree/lock handlers
├── services/
│   ├── git-worktree.ts       # (NOVO) - git worktree operations
│   ├── file-lock.ts          # (NOVO) - file locking manager
│   ├── opencode-sdk.ts       # (JA EXISTE)
│   ├── session-store.ts       # (JA EXISTE)
│   ├── team-store.ts         # (JA EXISTE)
│   └── pipeline-executor.ts  # (MODIFICAR) - usar locks
└── types/
    └── team.ts               # (MODIFICAR) - adicionar worktree info

apps/desktop/src/preload/
└── index.ts                  # (EXPANDIR) - worktree/lock API
```

---

## Modelagem de Dados

### FileLock
```typescript
interface FileLock {
  filePath: string
  agentId: string
  lockedAt: string
}
```

### GitWorktree
```typescript
interface GitWorktree {
  path: string
  branch: string
  agentId: string
  teamId: string
  createdAt: string
}
```

---

## TODOs

- [x] 1. Criar `apps/desktop/src/main/services/git-worktree.ts`

  **What to do**:
  - Criar GitWorktreeService class
  - Métodos:
    - `createWorktree(basePath, teamSlug, agentSlug, branchName)` - cria worktree
    - `removeWorktree(worktreePath)` - remove worktree
    - `listWorktrees(basePath)` - lista worktrees do projeto
    - `createBranch(worktreePath, branchName)` - cria branch
    - `mergeBranch(worktreePath, branchName, targetBranch)` - merge local
    - `getWorktreeForAgent(agentId)` - encontra worktree do agente
  - Usar `child_process.spawn` para comandos git
  - Worktree path: `{basePath}/.vibeide/worktrees/{teamSlug}-{agentSlug}`

  **References**:
  - SPEC-04 - "Estrutura de worktrees"
  - SPEC-04 - "Branch naming"

  **Acceptance Criteria**:
  - [ ] createWorktree funciona com git worktree add
  - [ ] removeWorktree funciona com git worktree remove
  - [ ] listWorktrees retorna worktrees do projeto

- [x] 2. Criar `apps/desktop/src/main/services/file-lock.ts`

  **What to do**:
  - Criar FileLockManager class
  - Mapa: `Map<string, FileLock>` (filePath -> lock)
  - Métodos:
    - `acquireLock(filePath, agentId)` - adquire lock se disponível
    - `releaseLock(filePath, agentId)` - libera lock
    - `checkLock(filePath)` - retorna lock atual ou null
    - `getLocksByAgent(agentId)` - todos os locks de um agente
    - `getAllLocks()` - todos os locks
    - `releaseAllByAgent(agentId)` - libera todos os locks de um agente
  - Events:
    - `lock:acquired` - quando lock é adquirido
    - `lock:released` - quando lock é liberado
    - `lock:denied` - quando lock é negado (arquivo já bloqueado)

  **References**:
  - SPEC-04 - "File locking"
  - SPEC-04 - "Verificação antes de disparar task"

  **Acceptance Criteria**:
  - [ ] acquireLock retorna sucesso/erro
  - [ ] releaseLock só libera se agentId corresponde
  - [ ] checkLock retorna lock atual

- [x] 3. Modificar `pipeline-executor.ts` para integrar locks

  **What to do**:
  - Importar FileLockManager
  - No método `startTask`: verificar locks dos arquivos antes de iniciar
  - Adquirir locks dos arquivos da task ao iniciar
  - Liberar locks ao completar/falhar task
  - Método `getTaskLocks(taskId)` - retorna locks de uma task

  **References**:
  - SPEC-04 - "Verificação antes de disparar task"

  **Acceptance Criteria**:
  - [ ] Task não inicia se arquivo já está bloqueado por outro agente
  - [ ] Locks são liberados quando task completa ou falha

- [x] 4. Expandir IPC handlers para worktree/lock

  **What to do**:
  - Adicionar handlers:
    - `vibe:worktree:create` - criar worktree
    - `vibe:worktree:remove` - remover worktree
    - `vibe:worktree:list` - listar worktrees
    - `vibe:worktree:merge` - fazer merge local
    - `vibe:lock:acquire` - adquirir lock
    - `vibe:lock:release` - liberar lock
    - `vibe:lock:check` - verificar lock
    - `vibe:lock:list` - listar todos locks

  **References**:
  - SPEC-01-architecture.md - "Padrão de nomes IPC"

  **Acceptance Criteria**:
  - [ ] Todos handlers registrados
  - [ ] Nomenclatura segue padrão vibe:*

- [x] 5. Expandir preload API para worktree/lock

  **What to do**:
  - Adicionar API:
    - `worktree: { create, remove, list, merge }`
    - `lock: { acquire, release, check, list }`
    - `onLockAcquired`, `onLockReleased`, `onLockDenied`

  **References**:
  - IPC handlers criados na task 4

  **Acceptance Criteria**:
  - [ ] window.vibeAPI.worktree.* disponível
  - [ ] window.vibeAPI.lock.* disponível

- [x] 6. Testar integração básica

  **What to do**:
  - Build do app
  - Verificar que IPC handlers respondem

  **References**:
  - npm run dev para testar

  **Acceptance Criteria**:
  - [ ] `npm run build` succeeds

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm run build
```

### Success Criteria
- [ ] GitWorktreeService gerencia worktrees
- [ ] FileLockManager gerencia locks
- [ ] PipelineExecutor verifica locks antes de executar
- [ ] IPC handlers para worktree/lock funcionam
- [ ] Preload API expõe worktree/lock métodos
- [ ] Build passa sem erros

---

## Final Verification Wave

- [x] F1. **GitWorktreeService Test** — ✅ git-worktree.ts created with create/remove/list/merge
- [x] F2. **FileLockManager Test** — ✅ file-lock.ts created with acquire/release/check/list
- [x] F3. **Pipeline Integration Test** — ✅ pipeline-executor.ts integrated with FileLockManager
- [x] F4. **Build Test** — ✅ Build passes (34 IPC handlers registered)

---

## Success Criteria

1. Worktrees podem ser criados e removidos por time/agente
2. Locks podem ser adquiridos e liberados
3. Tasks não iniciam se arquivos estão bloqueados
4. Tech lead pode fazer merge local
5. CEO não faz merge operacional (SPEC-04)

---

## Next Phases (NOT in this plan)

- Migrar Context → Jotai
- Implementar templates de times
- Implementar parsing de output estruturado do CEO
- UI de TeamsSidebar conectada ao backend

(End of file - total 237 lines)
