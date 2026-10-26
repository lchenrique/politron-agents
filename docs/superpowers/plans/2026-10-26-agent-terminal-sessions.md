# Agent Terminal Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run agent commands in visible, isolated PTY sessions in the Boobot Terminal panel, with remote-host output/control and explicit lifecycle for long-running processes.

**Architecture:** Add an `AgentTerminalService` to the `AppService` that owns one PTY per agent command/session on the workspace host. Stream bounded typed output events to the desktop renderer, expose scoped list/stop RPC for a connected desktop, keep the user's manual terminal separate, and leave PWA process-control APIs denied.

**Tech Stack:** Node.js `node-pty` (already installed and unpacked), Electron IPC, TypeScript, React/xterm.js, existing `CommandEvidence`, HostRpc/HostClient, Vitest.

## Global Constraints

- Agent commands appear in the internal Terminal UI; short commands return bounded output, exit status, and existing command evidence.
- Long-running processes have start/status/stop lifecycle and remain visible across conversation switches; the process runs on the workspace's local or remote host.
- PTY session ownership is scoped to workspace, conversation, run, and agent. The user's manual terminal remains separate.
- Existing `terminalEnabled`, workspace scope, write capability, approval, cancellation, output limits, and command evidence remain enforced; PTY is not an OS sandbox.
- Remote output/control uses the existing host transport and does not expose process listing/control to the PWA. Do not open a terminal window on a remote host.
- An external terminal is a separate action only for a direct user request; ordinary command or project-run requests never launch it.
- Preserve all existing working-tree changes. Do not reset, clean, stash, overwrite, or discard unrelated files.
- Do not commit per task. After both implementation plans pass, make the user-authorized final commit containing all current and new working-tree changes and push `master` to `origin/master`; if `npm run dist:win` fails, do not push.

---

## Task 1: Define PTY session types and build the process service

**Files:**
- Create: `apps/desktop/src/shared/agent-terminal.ts`
- Create: `apps/desktop/src/main/v9/agent-terminal.ts`
- Create: `apps/desktop/src/main/v9/agent-terminal.test.ts`
- Reuse: `apps/desktop/src/main/v9/command-evidence.ts`

**Interfaces:**
- `AgentTerminalStatus = 'starting' | 'running' | 'completed' | 'failed' | 'interrupted' | 'timed_out'`.
- `AgentTerminalScope = { workspaceId: string; conversationId: string; runId: string; agentId: string }`.
- `AgentTerminalSession` contains `id`, `scope`, `command`, `cwd`, `status`, bounded `output`, `truncated`, `exitCode`, `createdAt`, and nullable `finishedAt`.
- `AgentTerminalEvent` is `{ type: 'agentTerminal'; event: 'started' | 'output' | 'finished'; sessionId; scope; data?: string; session?: AgentTerminalSession }`; each output event is bounded to at most 16 KiB.
- `AgentTerminalService` exposes `run(input): Promise<CommandResult>`, `start(input): AgentTerminalSession`, `list(scope): AgentTerminalSession[]`, `stop(sessionId, scope): AgentTerminalSession`, `onEvent(listener)`, and `terminateAll()`.

- [ ] **Step 1: Write failing service tests** with an injected fake PTY adapter. Assert `run` streams output and resolves on exit, `start` returns a running session without blocking, `list` only returns the requested workspace/conversation, `stop` refuses another conversation's session, output is capped at 32 KB, and `terminateAll` kills active children.

```ts
const session = service.start({ command: 'npm run dev', cwd: root, scope })
expect(session.status).toBe('running')
expect(service.list(scope).map(item => item.id)).toContain(session.id)
expect(() => service.stop(session.id, otherConversationScope)).toThrow(/escopo/)
```

- [ ] **Step 2: Run `npm test -- src/main/v9/agent-terminal.test.ts` and confirm failure.**
- [ ] **Step 3: Implement the service using `node-pty`.** Spawn a non-windowed shell process with the workspace cwd, `-NoLogo -NoProfile -NonInteractive` on PowerShell, and the existing command environment allowlist from `workspace.ts`. Keep one PTY per session, batch/cap output, record exit/status, kill the process tree on timeout/cancel/stop, and never use a GUI terminal launcher in `run` or `start`.
- [ ] **Step 4: Rerun service tests** and require the lifecycle, isolation, cancellation, and output-limit cases to pass.

## Task 2: Route agent command tools through the PTY service

**Files:**
- Modify: `apps/desktop/src/main/v9/workspace.ts`
- Modify: `apps/desktop/src/main/v9/command-evidence.ts` only if required by the existing evidence contract
- Modify: `apps/desktop/src/main/v9/runtime-tools.live.test.ts`
- Modify: `apps/desktop/src/main/v9/agent-prompt.ts`
- Create or modify: `apps/desktop/src/main/v9/agent-prompt.test.ts`

**Interfaces:**
- Existing `workspace_run_command({ command })` remains the one-shot command interface and calls `AgentTerminalService.run`.
- Add `workspace_start_process({ command })`, `workspace_process_status({ sessionId })`, and `workspace_stop_process({ sessionId })` for long-running commands.
- `workspace_run_command`/`workspace_start_process` use the existing command approval request and permissions. Status/stop validate session scope against the active run/workspace before returning or stopping.

- [ ] **Step 1: Add failing runtime-tool tests** for short-command approval and output, starting a persistent process, status polling, stopping it, rejection of another conversation's ID, and absence of tools when `terminalEnabled` or write permission is off.
- [ ] **Step 2: Run the focused runtime tests and confirm the new cases fail.**
- [ ] **Step 3: Inject `AgentTerminalService` into `AppService`** and route `workspace_run_command` through `run`. Store the final result using the current `createCommandEvidence` path and continue returning `formatCommandEvidence` to the agent.
- [ ] **Step 4: Register the three process tools** only when the current run has terminal/write permission. `start` requests command approval before spawning; `status` and `stop` resolve only sessions matching the current scope. Save final evidence when a started process ends or is stopped; keep live status in the in-memory session registry.
- [ ] **Step 5: Update the agent instruction**: use short one-shot commands for finite work; use start/status/stop for dev servers; never open an external terminal unless the user directly asks for the system terminal.
- [ ] **Step 6: Rerun focused runtime/prompt tests** and preserve the current 120-second timeout and evidence output ceiling for one-shot commands.

## Task 3: Stream safe terminal state across local and remote hosts

**Files:**
- Modify: `apps/desktop/src/shared/v9.ts`
- Modify: `apps/desktop/src/main/v9/workspace.ts`
- Modify: `apps/desktop/src/main/v9/ipc.ts`
- Modify: `apps/desktop/src/main/hosts/rpc.ts`
- Modify: `apps/desktop/src/main/hosts/pwa-policy.test.ts`
- Modify: `apps/desktop/src/main/hosts/workspace.live.test.ts`
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/renderer/src/pwa/remote-api.ts` only to explicitly keep unsupported agent-terminal APIs absent

**Interfaces:**
- Extend `WorkspaceEvent` with the typed `AgentTerminalEvent` union; output events carry `workspaceId`, `conversationId`, `runId`, and `sessionId` so the renderer can filter.
- Add `AppAPI.agentTerminalSessions(conversationId, workspaceId)` and `AppAPI.agentTerminalStop(sessionId, conversationId, workspaceId)`.
- Add only `v9:agentTerminalSessions` and `v9:agentTerminalStop` to the desktop `HostRpc` allowlist; PWA authorization always denies both.

- [ ] **Step 1: Add failing tests** proving host PTY events reach the paired desktop over `v9:event`, status/stop RPC routes to the selected remote host, mismatched workspace/conversation IDs are rejected, and PWA dispatch denies list/stop even with every existing capability.
- [ ] **Step 2: Run focused host/RPC tests and confirm failure.**
- [ ] **Step 3: Emit bounded `agentTerminal` events** from the owning `AppService` as the PTY starts, outputs data, and finishes. Keep these separate from persisted `Snapshot` data; do not broadcast full output through PWA RPC responses.
- [ ] **Step 4: Register the scoped list/stop methods** in local `v9:ipc`, the `HostRpc` allowlist, and the preload API. Preserve existing HostManager routing so a remote workspace call reaches the remote host. Do not add either method to `shared/pwa-host-policy.ts` grants or `remote-api.ts` public methods.
- [ ] **Step 5: Extend PWA-policy and host live tests** to assert PWA list/stop is denied and remote desktop reconnect can retrieve running sessions and stop one.
- [ ] **Step 6: Rerun host/RPC/PWA tests** and confirm no manual terminal IPC was exposed remotely.

## Task 4: Show agent PTY sessions in the Terminal panel

**Files:**
- Create: `apps/desktop/src/renderer/src/components/ide/AgentTerminalSessions.tsx`
- Create: `apps/desktop/src/renderer/src/components/ide/AgentTerminalSessions.test.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ide/TerminalPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/features/panels/DockWorkspace.tsx`

**Interfaces:**
- Pass `conversationId` alongside `workspaceId` to `TerminalPanel`.
- `AgentTerminalSessions` receives `{ workspaceId, conversationId }`, loads `agentTerminalSessions`, listens to `onEvent`, renders xterm output for selected sessions, and invokes `agentTerminalStop` only for the displayed session's scope.

- [ ] **Step 1: Add failing UI tests** for active-session list, streamed output, status badge, selecting two sessions, stop action, filtering another conversation's events, and loading sessions after remote reconnect.
- [ ] **Step 2: Run the new component test and confirm failure.**
- [ ] **Step 3: Add an “Agentes” tab** next to the existing manual “Terminal” tab. Render the user's xterm exactly as before; render agent sessions in separate xterm views with command, owner, status, and stop control. Do not send agent command text through `vibeAPI.terminal.write`.
- [ ] **Step 4: Subscribe to typed events and rehydrate on mount** with `agentTerminalSessions`; filter every event by workspace and conversation. Preserve output bytes and scrollback bounds; dispose xterm/listeners on unmount without killing the PTY.
- [ ] **Step 5: Rerun component tests** and verify manual terminal behavior remains unchanged.

## Task 5: Add an explicit local-only external-terminal action

**Files:**
- Modify: `apps/desktop/src/main/v9/agent-terminal.ts`
- Modify: `apps/desktop/src/main/v9/workspace.ts`
- Modify: `apps/desktop/src/main/v9/agent-terminal.test.ts`
- Modify: `apps/desktop/src/main/v9/runtime-tools.live.test.ts`

- [ ] **Step 1: Add failing tests** that normal one-shot/start-process tools never launch a GUI terminal, the external action is omitted for remote hosts, and an explicit external-terminal request opens the selected local workspace in a system terminal.
- [ ] **Step 2: Run the focused tests and confirm failure.**
- [ ] **Step 3: Implement one distinct `workspace_open_external_terminal` action** with no arbitrary command parameter. Expose it only for local workspaces, require the user command approval flow, and use a process spawn with `shell: false` and workspace path passed safely as cwd/environment. Do not call it from `workspace_run_command`, `workspace_start_process`, or any automatic fallback.
- [ ] **Step 4: Rerun tests** and confirm remote workspaces and ordinary project starts never spawn an external terminal.

## Task 6: Verify terminal lifecycle and cross-host behavior

**Files:**
- Test: `apps/desktop/src/main/v9/agent-terminal.test.ts`
- Test: `apps/desktop/src/main/v9/runtime-tools.live.test.ts`
- Test: `apps/desktop/src/main/hosts/workspace.live.test.ts`
- Test: `apps/desktop/src/main/hosts/pwa-policy.test.ts`
- Test: `apps/desktop/src/renderer/src/components/ide/AgentTerminalSessions.test.tsx`

- [ ] Run focused terminal, runtime-tool, host, PWA-policy, and component tests; fix failures without weakening permissions or altering unrelated pre-existing behavior.
- [ ] Run `npm run typecheck` from `apps/desktop`.
- [ ] Run `npm run lint` and `npm test` from `apps/desktop`; report existing failures/flakiness accurately rather than masking or relabeling them.
- [ ] Confirm one-shot timeout/cancellation still terminates descendants, long-running sessions survive conversation switching and remote-client disconnect, and `AppService` shutdown cleans its own local processes.

## Task 7: Shared final package, commit, and push

**Dependency:** Complete and verify `2026-10-26-chat-links-platform-browser.md` first, then complete Tasks 1–6 in this plan.

**Files:**
- Build output: `apps/desktop/dist/Boobot-Setup-${version}-x64.exe`
- Include in final commit: all existing tracked/untracked checkout changes plus the approved spec, both plans, and implementation.

- [ ] Run `npm run dist:win` from `apps/desktop`; this runs the app/PWA build and creates the NSIS installer.
- [ ] Verify the exact `.exe` exists and record its absolute path. If installer generation fails, do not push.
- [ ] Review `git status --short`, full staged diff, and `git diff --check`; inspect pre-existing changes too, as explicitly authorized. Do not discard or silently omit changes; exclude only generated outputs already ignored by the project and secrets (report any secret found instead of committing it).
- [ ] Stage all intended changes with `git add -A`, inspect the staged diff, create one final commit after implementation/build, and push `master` to `origin/master`.
- [ ] Run `bright-memory save` per the project instructions and deliver the installer file, absolute path, commit, push result, and any failed checks.
