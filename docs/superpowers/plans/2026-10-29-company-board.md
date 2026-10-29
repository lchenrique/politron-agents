# Company Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent company board with teams, assigned work, independent review, rework, and explicit integration while preserving existing agent conversations.

**Architecture:** Store normalized board teams, tasks, assignment/review mission links, events, and bounded evidence in SQLite. A main-process `BoardService` validates every transition and coordinates isolated task workspaces with the existing mission/runtime system. Typed IPC exposes mutations to Electron and a read-only snapshot to paired PWA; a separate Board screen presents the workflow without changing the conversation shell.

**Tech Stack:** Electron main process, React 19, TypeScript, SQLite `DatabaseSync`, typed IPC/preload, Vitest and Testing Library, existing `GitWorkspaceService` and `MissionEngine`.

**Spec:** `docs/superpowers/specs/2026-10-29-company-board-design.md`

## Global Constraints

- Direct and group conversations, composer, mentions, queue, steering, and Chief optionality remain unchanged.
- Ordinary chat messages do not create board cards.
- Each task has one responsible agent and a distinct reviewer before execution.
- Code tasks use a dedicated worktree; reviewer tools cannot write; worktree survives review, rework, cancellation, and closure.
- The board never merges branches automatically; code reaches Done only after the user records integration evidence.
- PWA is read-only for board data in the first version.
- All IPC mutations are validated in the main process and preserve existing workspace and Chief approvals.

## Review Focus

- Repeated assignment or app restart must not duplicate a mission, worktree, or review round.
- Inactive agents, non-members, same worker/reviewer, archived workspaces, and invalid state transitions must be rejected without partial writes.
- Reviewer cannot alter files through broker tools, shell, or inherited worker capabilities.
- Cancellation, worker/reviewer failure, and missing workspace preserve task events and task files while showing a useful blocked reason.
- Existing navigation and chat flows work unchanged with an empty or populated board.

### Task 1: Board types, schema, and store

**Files:**
- Modify: `apps/desktop/src/shared/v9.ts`
- Modify: `apps/desktop/src/main/v9/store.ts`
- Test: `apps/desktop/src/main/v9/board-store.test.ts`

**Interfaces:** Define `BoardTeam`, `BoardTask`, `BoardEvent`, `BoardEvidence`, task/status enums, assignment records, and store methods for list/get/save teams/tasks, append/list events, link missions, and evidence. Bump schema to 11 with indexed normalized tables and a backup-compatible migration.

- [x] Write store tests for CRUD, reopen persistence, unique idempotency key, invalid/duplicate relation rejection, bounded event/evidence records, and migration from schema 10.
- [x] Run `npx vitest run src/main/v9/board-store.test.ts --reporter=dot` and confirm the new APIs fail to compile or assertions fail.
- [x] Implement schema migration and validated store methods without changing legacy tables.
- [x] Re-run the store tests and `npm run typecheck`.

### Task 2: Board state machine and team/task service

**Files:**
- Create: `apps/desktop/src/main/v9/board.ts`
- Modify: `apps/desktop/src/main/v9/workspace.ts`
- Test: `apps/desktop/src/main/v9/board.test.ts`

**Interfaces:** `BoardService` owns team/task validation and durable transitions (`create`, `assign`, `start`, `submitForReview`, `approveReview`, `requestChanges`, `block`, `resume`, and `recordIntegration`). Invalid transitions fail before any side effect. Events record actor, round, bounded note, status change, and timestamp.

- [x] Test required team membership, active distinct worker/reviewer, code-workspace requirement, valid status transitions, bounded review feedback, and integration-only closure for code.
- [x] Run the focused board service tests and verify rejection cases fail before implementation.
- [x] Implement main-process validation and transactional event/task updates; keep assignment idempotent.
- [x] Re-run `npx vitest run src/main/v9/board.test.ts --reporter=dot`.

### Task 3: Mission, worktree, and review execution

**Files:**
- Modify: `apps/desktop/src/main/v9/workspace.ts`
- Modify: `apps/desktop/src/main/v9/missions.ts`
- Modify: `apps/desktop/src/shared/v9.ts`
- Test: `apps/desktop/src/main/v9/board.test.ts` and `apps/desktop/src/main/v9/chief-control.test.ts`

**Interfaces:** Add board-task context to linked missions/runs and board tools for bounded progress and submission. Code assignment creates or reuses one task worktree; reviewer receives the same worktree in enforced read-only mode. Review approval ends a general task or moves code to Integration. Requested changes increment the round and resume the same worker/worktree. Reassignment preserves old mission links and creates a new mission.

- [x] Test assignment idempotency, worktree reuse, worker completion starting one distinct reviewer, reviewer read-only enforcement for file and command tools, rework round reuse, general completion, and code integration gate.
- [x] Run the focused execution tests and verify the assertions fail before implementation.
- [x] Connect the board service through existing mission, queue, workspace, and approval checks; no new global permissions.
- [x] Re-run execution tests and the existing mission/workspace tests.

### Task 4: Typed IPC and read-only PWA snapshot

**Files:**
- Modify: `apps/desktop/src/main/v9/ipc.ts`
- Modify: `apps/desktop/src/main/hosts/rpc.ts`
- Modify: `apps/desktop/src/shared/pwa-host-policy.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/shared/v9.ts`
- Test: `apps/desktop/src/main/hosts/pwa-policy.test.ts`

**Interfaces:** Expose board snapshot/list methods to paired PWA; team/task creation, assignment, transitions, integration, and worktree actions stay local desktop only. Snapshot changes publish small board events, not conversation transcripts.

- [x] Test each board read/mutation route, including a forged remote mutation rejected by PWA capability policy.
- [x] Implement typed local handlers and allowlisted remote reads only.
- [x] Run PWA policy tests and `npm run typecheck`.

### Task 5: Separate Board screen and task controls

**Files:**
- Create: `apps/desktop/src/renderer/src/features/board/BoardPage.tsx`
- Create: `apps/desktop/src/renderer/src/features/board/BoardPage.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.tsx`
- Modify: `apps/desktop/src/renderer/src/features/sidebar/Sidebar.tsx`

**Interfaces:** Add a top-level `board` view and navigation entry beside Chief/Rotinas. Board supports team filters, search, status columns, task details, create/edit/assign/review/block/integration actions, and links to existing conversations. It does not intercept ordinary chat input or create missions from messages.

- [x] Test empty/populated boards, filters, task creation/assignment validation, review/rework buttons, integration evidence requirement, and PWA read-only behavior.
- [x] Implement theme-token-based responsive Board page using existing components and explicit task actions.
- [x] Run focused UI tests and verify existing app-shell/sidebar tests.

### Task 6: Recovery, full acceptance, and product record

**Files:**
- Modify: `PRODUCT.md`
- Modify: `ESTRATEGIA_POLITRON.md`
- Modify: `docs/superpowers/specs/2026-10-29-company-board-design.md`

- [x] Add integration coverage for worker → reviewer → rework → approval → integration, restart recovery, canceled tasks, and duplicate assignment events.
- [x] Run the full Vitest suite, `npm run typecheck`, relevant lint, and `npm run build`.
- [x] Record exact validation output and any runtime/visual limitations; mark spec complete only for criteria with evidence.

## Validation result

- `npx vitest run --reporter=dot`: 150 files and 937 tests passed; 15 files and 21 conditional tests skipped.
- Focused board/Chief/PWA/IPC/navigation run: 10 files and 107 tests passed. `npm run typecheck` passed.
- ESLint on board, permission, worktree, and board UI modules: 0 errors, 1 max-lines warning in `board.ts`. ESLint on the touched integration files `workspace.ts`/`chief-control.ts` still reports 7 `no-explicit-any` errors in `workspace.ts` and 2 file-size warnings; the `any` findings are existing legacy code.
- `npm run build` passed for Electron, preload, renderer, and PWA. Vite reports its existing `use client`, sourcemap, PostCSS, and large-chunk warnings.
- Board workflows have automated UI/service coverage, but this implementation did not receive an Electron visual review, a paired-PWA session check, or live model-inference validation.
