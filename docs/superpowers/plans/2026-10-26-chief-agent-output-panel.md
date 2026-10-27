# Chief and Agent Output Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Chief form’s native selects with the existing shadcn Select and stop automatically opening the agent-output dock when a PTY starts.

**Architecture:** Keep the current mission assignment values/callbacks and replace only select presentation. Remove the auto-reveal side effect from AppShell while retaining the TerminalPanel and its read-only agent output tab, now labeled “Saídas dos agentes”.

**Tech Stack:** React, TypeScript, existing `@/components/ui/select`, Electron IPC events, Vitest and React Testing Library.

## Global Constraints

- Preserve all existing Chief options, mission validation, selection persistence and callbacks.
- Use the existing shadcn Select; do not add a native-select wrapper or dependency.
- Rename only the tab label; keep internal tab key and read-only output behavior.
- A PTY start may refresh/update its session but must not reveal the dock. Manual dock visibility remains under user control.
- The interactive terminal remains separate; do not change PTY permissions, grants, IPC or terminal isolation.
- Preserve unrelated working-tree changes; do not commit or push.

---

## Task 1: Replace the Central do Chief native selects

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/work/ChiefHome.tsx`
- Create: `apps/desktop/src/renderer/src/features/work/ChiefHome.test.tsx`
- Reuse: `apps/desktop/src/renderer/src/components/ui/select.tsx`

**Interfaces:**
- Project trigger keeps accessible name `Projeto`; values remain workspace IDs, including empty string for “Sem projeto (Livre)”.
- Owner trigger keeps accessible name `Responsável`; values remain agent IDs.
- `assign()` continues calling `window.appAPI.startMission({ goal, workspaceId, agentId })` with the selected values.

- [ ] **Step 1: Create a minimal `Snapshot` fixture** and mock only `startMission`, `missionAction`, and the callbacks used by `ChiefHome`.
- [ ] **Step 2: Add failing tests** proving the two controls expose `combobox` roles, selecting a project updates its value/localStorage, selecting an owner updates its value, and submitting calls `startMission` with the selected workspace/agent IDs.

```tsx
fireEvent.click(screen.getByRole('combobox', { name: 'Projeto' }))
fireEvent.click(await screen.findByRole('option', { name: 'Site Alpha' }))
fireEvent.click(screen.getByRole('combobox', { name: 'Responsável' }))
fireEvent.click(await screen.findByRole('option', { name: 'Ana' }))
fireEvent.click(screen.getByRole('button', { name: 'Atribuir' }))
expect(window.appAPI.startMission).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-alpha', agentId: 'agent-ana' }))
```

- [ ] **Step 3: Run** `npx vitest run src/renderer/src/features/work/ChiefHome.test.tsx`; confirm it fails because the native controls are not accessible Radix comboboxes yet.
- [ ] **Step 4: Replace only the select markup** with `Select`, `SelectTrigger`, `SelectValue`, `SelectContent` and `SelectItem` from `@/components/ui/select`. Keep the current values, option filtering, `localStorage` key and assignment callback unchanged.
- [ ] **Step 5: Rerun** the focused test and require all existing Chief behavior assertions to pass.

## Task 2: Stop PTY start from revealing the dock and relabel agent output

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ide/TerminalPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.performance.test.tsx`
- Create: `apps/desktop/src/renderer/src/components/ide/TerminalPanel.test.tsx`

**Interfaces:**
- `TerminalPanel` keeps internal tab key `agents`; only its visible label changes from `Agentes` to `Saídas dos agentes`.
- Starting a session continues publishing/refreshing `agentTerminal` events; the event handler must not call `dockRef.current.revealTool('terminal')`.
- If the user opened the dock manually, no code in this change hides it or changes the layout preference.

- [ ] **Step 1: Add failing tests** asserting `TerminalPanel` displays “Saídas dos agentes” and “Terminal”, and a `started` event in AppShell does not call `revealTool('terminal')`.
- [ ] **Step 2: Run** `npx vitest run src/renderer/src/components/ide/TerminalPanel.test.tsx src/renderer/src/features/app/AppShell.performance.test.tsx`; confirm the new assertions fail.
- [ ] **Step 3: Change the visible tab-label map** in `TerminalPanel.tsx` and remove only the `revealTool` call from the `agentTerminal/started` handler in `AppShell.tsx`. Do not remove the event subscription or the agent terminal session component.
- [ ] **Step 4: Rerun** the focused panel/AppShell tests; verify manual opening still shows the latest read-only session list and interactive terminal remains on its own tab.

## Task 3: Verify and report the scoped diff

**Files:**
- Test: `apps/desktop/src/renderer/src/features/work/ChiefHome.test.tsx`
- Test: `apps/desktop/src/renderer/src/components/ide/TerminalPanel.test.tsx`
- Test: `apps/desktop/src/renderer/src/features/app/AppShell.performance.test.tsx`

- [ ] Run `npx vitest run src/renderer/src/features/work/ChiefHome.test.tsx src/renderer/src/components/ide/TerminalPanel.test.tsx src/renderer/src/features/app/AppShell.performance.test.tsx` from `apps/desktop`.
- [ ] Run `npm run typecheck` from `apps/desktop`.
- [ ] Run `npx eslint src/renderer/src/features/work/ChiefHome.tsx src/renderer/src/features/work/ChiefHome.test.tsx src/renderer/src/components/ide/TerminalPanel.tsx src/renderer/src/components/ide/TerminalPanel.test.tsx src/renderer/src/features/app/AppShell.tsx src/renderer/src/features/app/AppShell.performance.test.tsx`.
- [ ] Confirm no test or diff changes PTY authorization, the panel's read-only nature, saved layout, or the separate interactive Terminal tab. Do not commit.
