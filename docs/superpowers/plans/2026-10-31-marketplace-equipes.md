# Marketplace de equipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Tela Marketplace com equipes prontas de Boos (primeira: Instagram, 54 skills da Ootto) que a pessoa contrata para Global ou um projeto; skills por Boo editáveis.

**Architecture:** Catálogo em arquivos dentro do app (`src/main/marketplace/catalog`, empacotado como `resources/marketplace`). `SkillsService` ganha origem `marketplace`, filtrada por `Agent.skillIds`. `AppService.hireTeam` cria Boos, liga ao projeto e abre conversa em grupo, com rollback. Renderer: `MarketplacePage` + diálogo de contratação; editor de Boo com seção Skills.

**Tech Stack:** Electron, React/TS, vitest, electron-builder.

**Spec:** `docs/superpowers/specs/2026-10-31-marketplace-equipes-design.md`

## Global Constraints

- Gratuito, sem rede: catálogo só local.
- Contratar nunca altera Boos existentes; menção repetida ganha sufixo `-2`, `-3`.
- Projeto: equipe padrão até 10 agentes; recusa antes de criar qualquer Boo.
- Skills do Marketplace só aparecem para Boos com o slug em `skillIds`; globais continuam para todos.
- Licença MIT da Ootto e atribuição copiadas junto das skills.
- Textos de UI em português com acentuação correta.

## Review Focus

- Contratar a mesma equipe duas vezes: segunda leva sufixos, nada quebra.
- Projeto com 7+ Boos padrão: recusa clara, zero Boos criados.
- Falha no meio (ex.: conversa): Boos criados nessa contratação são removidos.
- `read_skill` com `../` no caminho auxiliar: recusado.
- Boo com `skillIds` de slug inexistente: ignorado sem erro.

---

### Task 1: Catálogo e skills do Marketplace no processo principal
**Files:** Create `src/main/marketplace/catalog/**` (skills copiadas, `teams/instagram/team.json`, `NOTICE.md`, `LICENSE-ootto`), `src/main/marketplace/catalog.ts`; Modify `src/shared/skills.ts`, `src/main/v9/skills/discover.ts`, `service.ts`, `learning.ts`, `electron-builder.yml`; Test `src/main/marketplace/catalog.test.ts`, `src/main/v9/skills/marketplace-skills.test.ts`.
**Interfaces (produz):**
- `type SkillSource = … | 'marketplace'`
- `marketplaceRoot(): string`; `loadTeams(root?): Promise<MarketplaceTeam[]>` (shared `MarketplaceTeam { id; name; area; description; leader; members: MarketplaceMember[] }`, `MarketplaceMember { key; name; alias; role; description; instructions; color; pitsHeadAccessory?; skills: string[] }`)
- `SkillsService(root, marketplaceDir?)`; `list(agent?: { skillIds?: string[] })`; `listMarketplace()`; `readContent(id, file?, agent?)`.
- [ ] Testes: catálogo carrega instagram com 6 membros, 54 skills únicas, todas existentes na pasta; `list()` sem agente não tem marketplace; `list({skillIds:['virality','nao-existe']})` tem só virality de marketplace; `readContent('virality','references/x.md')` ok quando existe e `'../x'` rejeita.
- [ ] Implementar, rodar, commit.

### Task 2: Agent.skillIds e contratação
**Files:** Modify `src/shared/v9.ts` (`Agent.skillIds?: string[]`, API `marketplaceTeams()`, `hireTeam(input)`), `src/main/v9/store.ts` (saveAgent valida `skillIds`: slugs, máx. 60), `src/main/v9/workspace.ts` (skills por agente no turno/list_skills/read_skill com `file`; `agent_create` aceita `skillIds`; `hireTeam`), `src/main/v9/ipc.ts`, `src/preload/index.ts`, `src/main/hosts/rpc.ts`; Test `src/main/v9/marketplace-hire.test.ts`.
**Interfaces:** `hireTeam({ teamId; workspaceId?: string; runtime; model?: string }): Promise<{ agentIds: string[]; conversationId: string }>`.
- [ ] Testes: Global cria 6 Boos com skillIds e conversa em grupo líder=diretor; segunda contratação sufixa menções; projeto com 5 padrão recusa e não cria; projeto ok adiciona aos `defaultAgentIds`.
- [ ] Implementar, rodar, commit.

### Task 3: Tela Marketplace, contratação e Skills no editor
**Files:** Create `src/renderer/src/features/marketplace/MarketplacePage.tsx`, `marketplace.css`, `MarketplacePage.test.tsx`; Modify `Sidebar.tsx` (item Marketplace), `AppShell.tsx` (view `marketplace`), `editors/Editor.tsx` (seção Skills), `SettingsPage.tsx` (rótulo de origem Marketplace, sem remover).
- [ ] Testes: lista equipe e membros; Contratar abre diálogo com Global/projetos e chama `hireTeam`; editor salva `skillIds`.
- [ ] Implementar, typecheck, vitest, e2e visual rápido, commit.

### Task 4: Fechamento
- [ ] typecheck, vitest completo, lint dos arquivos novos, docs (PRODUCT.md/ESTRATEGIA seção 7), commit, merge no master, push.
