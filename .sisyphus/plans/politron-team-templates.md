# Politron - Team Templates Plan

## TL;DR

> **Objetivo**: Implementar templates pré-configurados de times
>
> **Entregas**: TeamTemplate types, catalog, API para usar templates
>
> **Esforço**: Médio
> **Execução Paralela**: NÃO

---

## Contexto

### O que existe
- TeamStore com CRUD de teams
- Agent catalog com tipos de agentes
- PipelineExecutor com tasks

### O que precisa ser feito
1. Definir tipos para TeamTemplate
2. Criar catalog de templates pré-definidos
3. Criar API para criar team a partir de template

---

## Work Objectives

### Objetivo Principal
Permitir criar teams rapidamente a partir de templates

### Entregas Concretas
- [ ] TeamTemplate types
- [ ] Template catalog com presets
- [ ] Método para criar team a partir de template

---

## Modelagem de Dados

### TeamTemplate
```typescript
interface TeamTemplate {
  id: string
  name: string
  description: string
  icon: string
  agentSlugs: string[]        // slugs do agent catalog
  suggestedTechLeadSlug?: string
  pipelineDescription: string
}
```

---

## TODOs

- [x] 1. Adicionar tipo TeamTemplate em types/team.ts

  **What to do**:
  - Adicionar interface TeamTemplate existente (já existe em team.ts)

  **Acceptance Criteria**:
  - [ ] TeamTemplate interface existe

- [x] 2. Criar agent-catalog.ts com templates

  **What to do**:
  - Criar `apps/desktop/src/main/services/agent-catalog.ts`
  - Definir AgentCatalogEntry interface
  - Criar array AGENT_CATALOG com agentes disponíveis
  - Criar TEAM_TEMPLATES com templates pré-configurados

  **References**:
  - SPEC-03-teams-pipeline.md

  **Acceptance Criteria**:
  - [ ] AGENT_CATALOG com agentes
  - [ ] TEAM_TEMPLATES com presets

- [x] 3. Expandir IPC handlers para templates

  **What to do**:
  - Adicionar handler: `vibe:template:list` - listar templates
  - Adicionar handler: `vibe:template:get` - obter template por ID
  - Adicionar handler: `vibe:team:createFromTemplate` - criar team a partir de template

  **References**:
  - SPEC-03-teams-pipeline.md

  **Acceptance Criteria**:
  - [x] vibe:template:list
  - [x] vibe:template:get
  - [x] vibe:team:createFromTemplate

- [x] 4. Expandir preload API

  **What to do**:
  - Adicionar: `template: { list, get }`
  - Adicionar: `team.createFromTemplate`

  **References**:
  - IPC handlers criados na task 3

  **Acceptance Criteria**:
  - [x] window.vibeAPI.template.*
  - [x] window.vibeAPI.team.createFromTemplate

- [x] 5. Testar build

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
- [ ] TeamTemplate types definidos
- [ ] Agent catalog com templates
- [ ] IPC handlers para templates
- [ ] Preload API expandida
- [ ] Build passa

---

## Final Verification Wave

- [x] F1. **Types Test** — TeamTemplate interface
- [x] F2. **Catalog Test** — agent-catalog.ts criado
- [x] F3. **IPC Test** — handlers registrados
- [x] F4. **Build Test** — npm run build

---

## Next Phases (NOT in this plan)

- Implementar parsing de output estruturado do CEO
- UI de TeamsSidebar conectada ao backend

(End of file - total 135 lines)
