# Politron - Context to Jotai Migration Plan

## TL;DR

> **Objetivo**: Migrar React Context API → Jotai para state management
>
> **Entregas**: Workspace atoms, Provider refactored, build passing
>
> **Esforço**: Médio
> **Execução Paralela**: NÃO - sequencial

---

## Contexto

### O que existe
- `WorkspaceContext` usando React Context + useState
- `useWorkspace` hook para consumir contexto
- `WorkspaceProvider` wrapper component

### O que precisa ser feito
1. Instalar jotai
2. Criar atoms para workspace state
3. Refatorar useWorkspace para usar atoms
4. Manter Provider compatibility
5. Testar build

---

## Work Objectives

### Objetivo Principal
State management com Jotai - mais eficiente e escalável

### Entregas Concretas
- [ ] Jotai instalado
- [ ] Workspace atoms criados
- [ ] useWorkspace refactored
- [ ] Build passa

---

## Excluded from Scope (Guardrails)
- NÃO migrar outros contextos ainda (só WorkspaceContext)
- NÃO criar novos atoms além do necessário

---

## Execution Strategy

### Estrutura alvo
```
apps/desktop/src/renderer/src/hooks/
├── useWorkspace.tsx    # (MODIFICAR) - usar atoms
└── atoms/
    └── workspace.ts    # (NOVO) - workspace atoms
```

---

## TODOs

- [x] 1. Instalar jotai

  **What to do**:
  - Adicionar jotai ao package.json do renderer
  - `npm install jotai` ou adicionar manualmente

  **Acceptance Criteria**:
  - [ ] jotai em dependencies

- [x] 2. Criar workspace atoms

  **What to do**:
  - Criar `apps/desktop/src/renderer/src/hooks/atoms/workspace.ts`
  - Converter state para atoms:
    - `workspaceAtom` - Workspace completo
    - `activeTeamIdAtom` - ID do time ativo
    - `activeProjectIdAtom` - ID do projeto ativo
    - `activeAgentTabIdAtom` - ID do tab ativo
    - `teamsAtom` - lista de teams
    - `messagesAtom` - mensagens por teamId

  **Acceptance Criteria**:
  - [ ] Atoms criados com tipos corretos
  - [ ] ReadWrite atoms para estado mutável

- [x] 3. Refatorar useWorkspace

  **What to do**:
  - Modificar `useWorkspace.tsx`:
    - Manter `WorkspaceProvider` para compatibilidade
    - Substituir useState + Context por useAtom
    - Manter mesma API pública (workspace, activeTeam, setActiveProject, etc.)

  **References**:
  - useWorkspace.tsx atual (WorkspaceContext)

  **Acceptance Criteria**:
  - [ ] useWorkspace continua funcionando igual
  - [ ] Provider continua sendo necessário

- [x] 4. Testar build

  **What to do**:
  - `cd apps/desktop && npm run build`
  - Verificar que não há erros

  **References**:
  - npm run build

  **Acceptance Criteria**:
  - [ ] Build succeeds

---

## Verification Strategy

### Test Commands
```bash
cd apps/desktop && npm run build
```

### Success Criteria
- [ ] Jotai instalado
- [ ] Atoms criados
- [ ] useWorkspace funciona igual
- [ ] Build passa

---

## Final Verification Wave

- [x] F1. **Install Test** — ✅ jotai installed
- [x] F2. **Atoms Test** — ✅ workspace atoms created
- [x] F3. **Hook Test** — ✅ useWorkspace uses atoms
- [x] F4. **Build Test** — ✅ Build passes

---

## Success Criteria

1. ✅ Workspace state em Jotai atoms
2. ✅ useWorkspace hook continua com mesma API
3. ✅ Provider continua existindo (compatibilidade)
4. ✅ Build passa

---

## Next Phases (NOT in this plan)

- Implementar templates de times
- Implementar parsing de output estruturado do CEO
- UI de TeamsSidebar conectada ao backend

(End of file - total 140 lines)
