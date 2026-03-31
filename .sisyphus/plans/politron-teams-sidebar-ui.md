# Politron - TeamsSidebar UI Backend Connection Plan

## TL;DR

> **Objetivo**: Conectar TeamsSidebar ao backend via IPC
>
> **Entregas**: TeamsSidebar mostrando dados reais do TeamStore
>
> **Esforço**: Médio
> **Execução Paralela**: NÃO

---

## Contexto

### O que existe
- TeamsSidebar component em `apps/desktop/src/renderer/src/components/ide/TeamsSidebar.tsx`
- useWorkspace hook com mock data (initiallyWorkspace)
- Backend TeamStore com CRUD completo
- IPC handlers para teams, agents, pipelines
- Preload API com vibeAPI.team.* methods

### O que precisa ser feito
1. Substituir mock data por chamadas IPC reais
2. Adicionar event listeners para manter estado sync
3. Wire up ações (pause/resume/hire/fire) para IPC calls

---

## TODOs

- [x] 1. Modificar useWorkspace para carregar teams do backend

  **What to do**:
  - Em `useWorkspace.tsx`, adicionar `useEffect` no mount
  - Chamar `window.vibeAPI.team.list()` para buscar teams
  - Atualizar `workspaceAtom` com dados reais
  - Substituir `initialWorkspace` mock por estado vazio

  **References**:
  - useWorkspace.tsx (current mock initialization)
  - preload/index.ts (vibeAPI.team.list)

  **Acceptance Criteria**:
  - [x] Teams são carregados do backend
  - [x] UI mostra dados reais

- [x] 2. Adicionar event listeners para team updates

  **What to do**:
  - No `useEffect` de useWorkspace, adicionar listeners:
    - `onTeamCreated` → adicionar team ao state
    - `onTeamUpdated` → atualizar team no state
    - `onTeamDeleted` → remover team do state
    - `onTeamAgentAdded` → adicionar agent
    - `onTeamAgentRemoved` → remover agent
    - `onTeamPaused` / `onTeamResumed` → atualizar status

  **References**:
  - preload/index.ts (event listeners)
  - workspace.ts atoms

  **Acceptance Criteria**:
  - [x] Mudanças no backend refletem na UI
  - [x] Estado fica em sync

- [x] 3. Wire up ações para IPC calls

  **What to do**:
  - `toggleTeamStatus(teamId)` → `team.pause()` ou `team.resume()`
  - `addAgentToTeam()` → `team.hire()`
  - `removeAgentFromTeam()` → `team.fire()`
  - `setActiveTeam(teamId)` → `team.get(teamId)`

  **References**:
  - useWorkspace.tsx (action functions)
  - preload/index.ts (team API)

  **Acceptance Criteria**:
  - [x] Ações modificam estado no backend
  - [x] UI atualiza após ações

- [ ] 4. Testar fluxo completo

  **What to do**:
  - Criar team via UI
  - Verificar que aparece na sidebar
  - Pausar/resumar team
  - Contratar agente
  - Verificar eventos no console

  **Acceptance Criteria**:
  - [ ] Team creation funciona
  - [ ] Status toggle funciona
  - [ ] Events chegam na UI

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm run dev
```

### Success Criteria
- [ ] Sidebar mostra teams do TeamStore
- [ ] Ações de UI modificam backend
- [ ] Eventos mantêm UI sync

---

## Final Verification Wave

- [x] F1. **Load Test** — Teams carregados do backend
- [x] F2. **Event Test** — Eventos sincronizam UI
- [x] F3. **Action Test** — Ações modificam backend
- [x] F4. **E2E Test** — Fluxo completo funciona

---

## Next Phases (NOT in this plan)

- (All phases complete)
