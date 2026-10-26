# Chat Links and Platform Browser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open workspace file links in the Boobot editor, ordinary web links in a separate platform browser, and Ctrl/Cmd-clicked HTTP(S) links in the system browser.

**Architecture:** Classify Markdown hrefs with a pure renderer helper, route approved targets from the conversation through `AppShell`/`DockWorkspace`, and add a dedicated Electron `WebContentsView` for user browsing. The existing agent `BrowserPanel` remains unchanged and isolated.

**Tech Stack:** Electron 40 `WebContentsView`, React, TypeScript, ReactMarkdown/GFM, existing DockWorkspace/FilePreview, Vitest, Electron IPC/preload.

## Global Constraints

- Normal HTTP/HTTPS links from chat open in the platform browser; Ctrl/Cmd+click opens the system browser.
- File links are explicit relative Markdown links confined to the workspace of the current conversation.
- The platform browser is separate from agent browser sessions; it has no Node/preload and accepts only HTTP/HTTPS navigation.
- The PWA keeps normal web navigation; local editor routing is Electron Desktop-only.
- Preserve all existing working-tree changes. Do not reset, clean, stash, overwrite, or discard unrelated files.
- Do not commit per task. The user requested one final commit containing all current and new changes, followed by push to `origin/master` after release checks.

---

## Task 1: Add a pure classifier for message links

**Files:**
- Create: `apps/desktop/src/renderer/src/features/chat/message-link.ts`
- Create: `apps/desktop/src/renderer/src/features/chat/message-link.test.ts`

**Interfaces:**
- Produces `classifyMessageLink(href: string): MessageLinkTarget`.
- `MessageLinkTarget` is exactly one of `{ kind: 'anchor' }`, `{ kind: 'url'; url: string }`, `{ kind: 'file'; path: string }`, or `{ kind: 'blocked' }`.
- Relative file paths are normalized to `/` separators and decoded once; the classifier does not access the filesystem.

- [ ] **Step 1: Write failing classifier tests** for absolute HTTP/HTTPS, `#fragment`, `./src/My%20File.ts`, a simple extensionless project file, traversal (`../secret` and encoded traversal), absolute paths, malformed percent encoding, and `javascript:`, `file:`, `mailto:`.

```ts
expect(classifyMessageLink('https://docs.example.test/a')).toEqual({ kind: 'url', url: 'https://docs.example.test/a' })
expect(classifyMessageLink('#result')).toEqual({ kind: 'anchor' })
expect(classifyMessageLink('./src/My%20File.ts')).toEqual({ kind: 'file', path: 'src/My File.ts' })
expect(classifyMessageLink('../secret.txt')).toEqual({ kind: 'blocked' })
expect(classifyMessageLink('javascript:alert(1)')).toEqual({ kind: 'blocked' })
```

- [ ] **Step 2: Run the test and confirm it fails** because the classifier module does not exist.

```powershell
npm test -- src/renderer/src/features/chat/message-link.test.ts
```

- [ ] **Step 3: Implement `classifyMessageLink`**. Handle `#` anchors first; parse absolute URLs with `URL`; allow only `http:`/`https:` without embedded username/password; reject any other URI scheme, absolute path, query on a relative file path, NUL, malformed encoding, or `..` segment; normalize `.` and backslash separators; return `blocked` on parse errors.
- [ ] **Step 4: Rerun the classifier test** and require all cases to pass.

## Task 2: Route Markdown clicks without breaking GFM

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageMarkdown.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageMarkdown.test.tsx`
- Reuse: `apps/desktop/src/renderer/src/features/chat/message-link.ts`

**Interfaces:**
- Add `MessageMarkdownLinkHandlers` with optional callbacks `openUrl(url: string, mode: 'internal' | 'external')`, `openFile(path: string)`, and `blocked()`.
- Add optional `linkHandlers` to `MessageMarkdown`; without a target callback, preserve existing anchor behavior until its routing task is integrated. Without desktop handlers, PWA rendering retains ordinary browser-link behavior.

- [ ] **Step 1: Add failing tests** asserting normal HTTP click calls `openUrl(url, 'internal')`, Ctrl-click and Meta-click call `openUrl(url, 'external')`, file links call `openFile(path)`, blocked schemes call `blocked()` and do not navigate, and `#fragment` links remain native GFM anchors.
- [ ] **Step 2: Run `MessageMarkdown.test.tsx` and confirm the new assertions fail.**
- [ ] **Step 3: Implement anchor handling.** Intercept only classified targets when `linkHandlers` exists; prevent default before invoking the callback. Use Ctrl/Meta as the external modifier only for HTTP(S). File links stay internal. Do not set `_blank` for fragment links. Keep `target="_blank"`/`rel="noopener noreferrer"` for HTTP(S) when no desktop handler is supplied, preserving PWA behavior.
- [ ] **Step 4: Rerun `MessageMarkdown.test.tsx`** and require existing code/table/GFM tests plus the new link tests to pass.

## Task 3: Connect message targets to the active workspace and dock

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageItem.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageList.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageList.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.tsx`
- Reuse: `apps/desktop/src/renderer/src/features/panels/DockWorkspace.tsx`

**Interfaces:**
- `MessageList` and `MessageItem` accept the typed link handlers and pass them only to message-body Markdown.
- In this task `AppShell` supplies only `openFile(path)`, calling `dockRef.current.openFile(selected.workspaceId, path)`; URL routing is connected after the browser panel exists in Task 5.

- [ ] **Step 1: Add failing tests** for prop forwarding from `MessageList` to rendered message Markdown and for an absent workspace producing a notice instead of falling back to OS file opening.
- [ ] **Step 2: Run the focused MessageList tests and confirm the new cases fail.**
- [ ] **Step 3: Add the smallest file-link prop chain and AppShell callback.** Use the selected conversation's workspace ID; if there is none, call `setNotice` with a clear message and do not open the OS path. In browser/PWA mode do not supply desktop handlers.
- [ ] **Step 4: Rerun `MessageList.test.tsx` and `MessageMarkdown.test.tsx`.** Also confirm `FilePreview` remains responsible for actual file reads, so its existing main-process workspace-path validation is still authoritative.

## Task 4: Add a secure platform-browser main-process service

**Files:**
- Create: `apps/desktop/src/shared/platform-browser.ts`
- Create: `apps/desktop/src/main/ipc/platform-browser.ts`
- Create: `apps/desktop/src/main/ipc/platform-browser.test.ts`
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/preload/index.ts`

**Interfaces:**
- `PlatformBrowserState`: `{ url: string; title: string; loading: boolean; canGoBack: boolean; canGoForward: boolean; error: string | null }`.
- `PlatformBrowserAPI`: `open(url)`, `navigate(url)`, `setBounds(bounds, visible)`, `back()`, `forward()`, `reload()`, `openExternal(url)`, `close()`, and `onState(callback)`.
- The API is exposed only through the local desktop preload bridge, never as a PWA/host RPC method.

- [ ] **Step 1: Add failing main-process tests** with an injected fake `WebContentsView` factory. Assert HTTP/HTTPS allow, `javascript:`, `file:`, and credential-bearing URLs deny; external-open uses `shell.openExternal` only after validation; bounds reject non-finite/negative sizes; `close()` removes and destroys the view.
- [ ] **Step 2: Run `npm test -- src/main/ipc/platform-browser.test.ts` and confirm failure.**
- [ ] **Step 3: Implement the service.** Attach one `WebContentsView` to the main `BrowserWindow.contentView`; use `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, no preload, and a dedicated partition separate from agent browser state. Validate every navigation and external-open URL in main. Disable remote popups; expose only bounded resize/visibility and browser controls. Destroy the view on main-window teardown.
- [ ] **Step 4: Register safe IPC and preload methods.** Validate IPC payloads again in main; do not add platform-browser methods to `HostRpc` or PWA dispatch.
- [ ] **Step 5: Rerun the service tests** and require the validation/lifecycle cases to pass.

## Task 5: Add the browser panel to the dock

**Files:**
- Create: `apps/desktop/src/renderer/src/features/panels/PlatformBrowserPanel.tsx`
- Create: `apps/desktop/src/renderer/src/features/panels/PlatformBrowserPanel.test.tsx`
- Modify: `apps/desktop/src/renderer/src/features/panels/dock-layout.ts`
- Modify: `apps/desktop/src/renderer/src/features/panels/DockWorkspace.tsx`
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.tsx`

**Interfaces:**
- Add `DockTool` kind `platform-browser` and `DockWorkspaceHandle.openPlatformUrl(url: string)`.
- Keep existing `browser` tool for agent automation and label it “Navegador do agente”; label the new tool “Navegador”.

- [ ] **Step 1: Add failing layout/panel tests** for serializing/restoring the new tool, opening the tab with a URL, and toolbar actions calling `back`, `forward`, `reload`, and `navigate`.
- [ ] **Step 2: Run the focused dock/panel tests and confirm failure.**
- [ ] **Step 3: Add the Dock tool and `openPlatformUrl`.** Opening an HTTP(S) link activates the platform-browser tab and navigates that view; preserve existing tabs and saved layout validation.
- [ ] **Step 4: Implement the panel toolbar** (address input, back, forward, reload) and a measured viewport. Use `ResizeObserver` to send bounded CSS-pixel bounds and set native-view visibility false when the dock tab is inactive or the panel unmounts. Keep the React toolbar above the native view.
- [ ] **Step 5: Keep `browserMode`/PWA filtering explicit.** Do not expose the platform WebContentsView in PWA; preserve ordinary PWA links.
- [ ] **Step 6: Rerun focused dock/panel tests** and verify existing agent BrowserPanel behavior is unchanged.

## Task 6: Harden external URL handoff and teach explicit file links

**Files:**
- Modify: `apps/desktop/src/main/index.ts`
- Modify: `apps/desktop/src/main/v9/agent-prompt.ts`
- Create or modify: `apps/desktop/src/main/v9/agent-prompt.test.ts`
- Modify: `apps/desktop/src/main/ipc/platform-browser.ts`

- [ ] **Step 1: Add failing tests** proving that only the explicit external URL callback opens the system browser, unsupported schemes never reach `shell.openExternal`, and the agent prompt requires relative Markdown links when naming created/changed/relevant files.
- [ ] **Step 2: Run the focused tests and confirm failure.**
- [ ] **Step 3: Implement safe external handoff.** Ctrl/Cmd-click calls the validated main-process `openExternal`; do not rely on arbitrary `window.open`. Restrict the main window `setWindowOpenHandler` to safe HTTP(S) behavior and deny everything else.
- [ ] **Step 4: Add the concise agent instruction** to use links such as `[src/file.ts](src/file.ts)` and not turn code blocks or arbitrary paths into links.
- [ ] **Step 5: Rerun focused tests.**

## Task 7: Verify the navigation subsystem

**Files:**
- Test: `apps/desktop/src/renderer/src/features/chat/message-link.test.ts`
- Test: `apps/desktop/src/renderer/src/features/chat/MessageMarkdown.test.tsx`
- Test: `apps/desktop/src/renderer/src/features/chat/MessageList.test.tsx`
- Test: `apps/desktop/src/main/ipc/platform-browser.test.ts`
- Test: `apps/desktop/src/renderer/src/features/panels/PlatformBrowserPanel.test.tsx`

- [ ] Run focused tests for all files above; fix failures without editing unrelated pre-existing behavior.
- [ ] Run `npm run typecheck` from `apps/desktop`.
- [ ] Run `npm run build` from `apps/desktop` and confirm both Electron and PWA build; PWA link fallback remains intact.
- [ ] Inspect `git diff --check` and the complete changed diff before moving to the terminal plan. Do not commit yet; release is shared by both plans.
