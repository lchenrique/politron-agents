# PWA Images and Message Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow authenticated PWA and desktop-chat users to queue messages during active runs, choose supported immediate steering, and send temporary image attachments up to 20 MB from PWA.

**Architecture:** Reuse persisted `v9_messages`/`v9_runs` plus `WorkspaceQueue`; add an idempotent delivery option and targeted cancellation without a parallel queue table. Upload images as bounded binary streams into a host-side temporary attachment store, then pass opaque attachment IDs through the existing authorized chat path; runtime adapters convert validated host files into their native image input formats.

**Tech Stack:** Electron, Node HTTP, React, TypeScript, SQLite JSON records, Playwright runtime adapters, Vitest, existing PWA cookie/grant gateway.

## Global Constraints

- Preserve all 14 Electron themes, shared components/tokens, typography and existing mobile direction A.
- `chat` grant is required for upload, send, queue, cancel and retry; no PWA terminal/PTY access or permission bypass.
- Maximum image size is 20 MB (20 * 1024 * 1024 bytes) per file; accept only validated PNG/JPEG/WebP and do not increase the existing 2 MB JSON-body limit.
- Attachments are host-temporary and scoped to the conversation/message: unlinked uploads expire after 1 hour, accepted files after 24 hours, and cancelled queued files immediately; never send absolute host paths to the renderer.
- Enable image send only for runtime adapters that pass image-input tests; unsupported runtimes reject images visibly and preserve text-only send.
- Queue order is host acceptance order. On host restart, current recovery semantics remain: nonterminal runs become `interrupted` and are not replayed automatically.
- Keep the existing text-file attachment behavior; image binary transport is a PWA capability in this scope.
- Preserve existing uncommitted working-tree changes; do not reset, stash, overwrite unrelated edits, commit, or push.

---

## Task 1: Define typed message input and attachment storage

**Files:**
- Modify: `apps/desktop/src/shared/v9.ts`
- Modify: `apps/desktop/src/main/v9/agent-runtime.ts`
- Create: `apps/desktop/src/main/pwa/attachment-store.ts`
- Create: `apps/desktop/src/main/pwa/attachment-store.test.ts`

**Interfaces:**
- `MessageAttachment`: `{ id: string; name: string; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; size: number }`.
- `SendOptions`: `{ requestId: string; delivery: 'queue' | 'now'; attachments?: MessageAttachment[]; returnAfterAcceptance?: boolean }`.
- Add optional `attachments` to `Message`; add `'cancelled'` to `RunStatus`.
- `AgentInput`: `{ text: string; images: Array<{ name: string; mimeType: string; path: string }> }`; `path` exists only in main-process memory and never in RPC/event objects.
- `AttachmentStore.put(conversationId, bytes, declaredMime, fileName)` returns opaque metadata; `resolve(conversationId, id)` returns a validated host-only path; `remove(id)` and `cleanupExpired(now)` remove temporary files.

- [ ] **Step 1: Write failing storage tests** for supported PNG/JPEG/WebP magic bytes, MIME mismatch, unsupported bytes, empty file, exactly 20 MB, 20 MB + 1 byte, opaque IDs, conversation scoping, remove, and expiry.

```ts
const saved = await store.put('conv-1', validPng, 'image/png', 'captura.png')
expect(saved).toMatchObject({ name: 'captura.png', mimeType: 'image/png', size: validPng.length })
await expect(store.resolve('conv-2', saved.id)).rejects.toThrow()
await expect(store.put('conv-1', new Uint8Array(20 * 1024 * 1024 + 1), 'image/png', 'large.png')).rejects.toThrow(/20 MB/)
```

- [ ] **Step 2: Run** `npx vitest run src/main/pwa/attachment-store.test.ts` from `apps/desktop`; confirm failures are about the missing store/validation.
- [ ] **Step 3: Implement `AttachmentStore`** using random opaque IDs and a dedicated temporary subdirectory. Stream/copy only after byte-count and magic-byte validation; normalize displayed filename; persist no client path. Keep a bounded expiry cleanup and make remove idempotent.
- [ ] **Step 4: Rerun the storage tests** and require boundary, scope and cleanup cases to pass.

## Task 2: Add authenticated streaming upload and history retrieval

**Files:**
- Modify: `apps/desktop/src/main/pwa/gateway.ts`
- Modify: `apps/desktop/src/main/pwa/gateway.test.ts`
- Modify: `apps/desktop/src/main/hosts/rpc.ts`
- Modify: `apps/desktop/src/main/hosts/manager.ts`
- Modify: `apps/desktop/src/shared/pwa-host-policy.ts`
- Modify: `apps/desktop/src/renderer/src/pwa/api.ts`
- Modify: `apps/desktop/src/renderer/src/pwa/remote-api.ts`
- Reuse: `apps/desktop/src/main/pwa/attachment-store.ts`

**Interfaces:**
- Add `uploadAttachment(conversationId: string, file: File): Promise<MessageAttachment>` to the remote PWA API.
- Add bounded raw-body `POST /api/attachments?conversationId=<id>` and authorized `GET /api/attachments/<opaque-id>`; use the existing paired-device cookie, origin/CSRF checks and `chat` grant.
- Add `v9:cancelQueuedMessage` to `chat`-authorized PWA methods. Do not grant `terminal`, PTY or `files:write` as a side effect.

- [ ] **Step 1: Add failing gateway tests** for upload denied without `chat`, upload accepted with `chat`, wrong origin/CSRF rejected, MIME mismatch rejected, exactly 20 MB accepted, 20 MB + 1 rejected with 413, and download denied for an unrelated conversation/device. Keep `/api/rpc` JSON payload cap at 2 MB.
- [ ] **Step 2: Run** `npx vitest run src/main/pwa/gateway.test.ts src/main/hosts/pwa-policy.test.ts`; confirm new cases fail.
- [ ] **Step 3: Implement streaming routes** that authenticate before writing, enforce a streaming byte counter rather than buffering unbounded requests, call `AttachmentStore`, and return only opaque metadata. Add the same grant/origin checks to download and cancellation paths.
- [ ] **Step 4: Add `requestBinary` to `pwa/api.ts`**: POST a `File` body with same-origin credentials and `X-Boobot-PWA`; preserve structured HTTP errors. Add the typed upload wrapper in `remote-api.ts`.
- [ ] **Step 5: Rerun** the gateway/policy tests and require the original pairing, revocation, RPC and JSON-size tests to remain green.

## Task 3: Add host queue semantics and runtime image adapters

**Files:**
- Modify: `apps/desktop/src/main/v9/workspace.ts`
- Modify: `apps/desktop/src/main/v9/store.ts`
- Modify: `apps/desktop/src/main/v9/agent-runtime.ts`
- Modify: `apps/desktop/src/main/v9/codex.ts`
- Modify: `apps/desktop/src/main/v9/claude.ts`
- Modify: `apps/desktop/src/main/v9/pi.ts`
- Modify: `apps/desktop/src/main/v9/opencode-server.ts`
- Modify: `apps/desktop/src/main/v9/antigravity.ts`
- Modify: `apps/desktop/src/main/v9/steering.test.ts`
- Modify or create: focused adapter tests under `apps/desktop/src/main/v9/`
- Modify: `apps/desktop/src/shared/v9.ts`

**Interfaces:**
- Keep internal `AppService.send` callers backward-compatible; add optional `SendOptions` at the end of the method contract.
- `delivery: 'queue'` skips automatic steering and creates the ordinary persisted user `Message` + `Run` with `queued` status. `delivery: 'now'` retains the existing steer path and rejects if the runtime cannot steer.
- Use `requestId` as the user message ID after UUID validation. If the same ID already belongs to the same conversation/user, return its existing accepted status; reject an ID collision across conversations/roles.
- `cancelQueuedMessage(messageId)` cancels only when all associated root runs remain `queued`; mark affected user/assistant messages and runs `cancelled`, abort those queue signals, emit updates, and do not call `stop(conversationId)`.
- `AgentRuntime.send(threadId, input: AgentInput, model?, timeout?)`; each runtime exposes explicit `supportsImages` and `supportsImageSteer` capabilities. Image steering is off unless its adapter proves it.

- [ ] **Step 1: Add failing queue tests** for default legacy internal semantics, explicit queued delivery while running on non-steer runtime, explicit `now` steering only on steer runtime, duplicate `requestId` producing one user message/run, cancellation affecting only not-yet-started queued run(s), and unrelated runs continuing.

```ts
await service.send(chat.id, 'primeira')
await service.send(chat.id, 'segunda', undefined, undefined, undefined, false, true, false,
  { requestId: '2d152f04-4f40-4a88-9e71-d650b26c2336', delivery: 'queue', returnAfterAcceptance: true })
expect(service.store.history(chat.id).find(item => item.id === '2d152f04-4f40-4a88-9e71-d650b26c2336')?.status).toBe('queued')
```

- [ ] **Step 2: Run** `npx vitest run src/main/v9/steering.test.ts src/main/v9/routing.test.ts`; confirm the queue/duplicate/cancel assertions fail before implementation.
- [ ] **Step 3: Implement send acceptance** by reusing `v9_messages`, `v9_runs` and `WorkspaceQueue`; create persisted queued state before returning acceptance, preserve accepted order, and attach a rejection handler to background tasks so later failures become persisted `failed` states rather than unhandled promises. Do not add a queue table or auto-replay on restart.
- [ ] **Step 4: Implement targeted cancellation**: find all root runs by `inputMessageId`, require each to be queued, abort only their controllers, update statuses/events, and update message search indexing for `cancelled`.
- [ ] **Step 5: Add runtime image capability tests.** Convert `AgentInput` to Codex text + `localImage` blocks, Claude SDK image blocks, and OpenCode image file parts. Keep Pi and Antigravity disabled unless tests against their actual adapters demonstrate support. Keep image steering disabled unless a separate test proves it.
- [ ] **Step 6: Rerun** the steering/routing/store and focused adapter tests; require the existing automatic steering test to pass using explicit `delivery: 'now'` and preserve internal `respondVoice`/`respondToAgent` behavior.

## Task 4: Connect PWA/desktop composer to queue and image messages

**Files:**
- Modify: `apps/desktop/src/shared/v9.ts`
- Modify: `apps/desktop/src/main/v9/ipc.ts`
- Modify: `apps/desktop/src/main/pwa/gateway.ts`
- Modify: `apps/desktop/src/renderer/src/pwa/remote-api.ts`
- Modify: `apps/desktop/src/renderer/src/features/app/AppShell.tsx`
- Modify: `apps/desktop/src/renderer/src/features/composer/Composer.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ai/prompt-input.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageItem.tsx`
- Modify: `apps/desktop/src/renderer/src/features/chat/MessageList.tsx`
- Create: `apps/desktop/src/renderer/src/features/composer/Composer.queue.test.tsx`
- Create or modify: `apps/desktop/src/renderer/src/features/chat/MessageItem.attachments.test.tsx`

**Interfaces:**
- Extend `AppAPI.send(conversationId, text, model?, effort?, planMode?, options?: SendOptions): Promise<void>`; expose `cancelQueuedMessage(messageId)`.
- The PWA `submitMessage` uploads selected image files first, then calls `send` with opaque refs, UUID requestId and selected delivery mode. Desktop text files keep their current inline behavior.
- While a run is active, primary submit uses `delivery:'queue'`; show queue position/status and per-message cancel while queued. Show “Enviar agora” only for text or image-steer capability confirmed by the current runtime.

- [ ] **Step 1: Add failing Composer tests**: queue submits during an active non-steer run; send-now appears only for steer-capable text; image send-now remains hidden unless `supportsImageSteer`; duplicate click does not reuse a request ID; cancelling one queue item calls only its API.
- [ ] **Step 2: Add failing PWA attachment tests** for picker/drop of PNG/JPEG/WebP, 20 MB boundary, unsupported runtime disabled state, upload failure retaining draft, and successful submission containing opaque refs rather than file text/base64.
- [ ] **Step 3: Run** `npx vitest run src/renderer/src/features/composer/Composer.queue.test.tsx src/renderer/src/features/chat/MessageItem.attachments.test.tsx`; confirm expected failures.
- [ ] **Step 4: Implement the minimal UI.** Keep `PromptInput` files in local component state, add PWA `accept="image/png,image/jpeg,image/webp"`, upload before RPC, clear only after the host confirms acceptance, and preserve the draft for pre-accept upload/validation errors. Render queued/cancelled/failed status and safe image preview through the authorized attachment route.
- [ ] **Step 5: Add a “Reenviar” action only to failed/interrupted user messages with unexpired stored attachments.** It creates a new request ID and uses the same content refs; if expired, keep the original message visible and explain that the image must be attached again. Never retry automatically.
- [ ] **Step 6: Rerun** the new tests plus `src/renderer/src/features/app/AppShell.performance.test.tsx` and existing composer/chat tests.

## Task 5: Validate PWA security, real runtime support and regressions

**Files:**
- Test: `apps/desktop/src/main/pwa/gateway.test.ts`
- Test: `apps/desktop/src/main/pwa/attachment-store.test.ts`
- Test: `apps/desktop/src/main/v9/steering.test.ts`
- Test: runtime adapter image tests
- Test: renderer queue/attachment tests
- Validate: `apps/desktop/scripts/verify-pwa-web.cjs`

- [ ] Run `npm run test:pwa` from `apps/desktop`; require pairing, revocation, grants and web-asset checks to pass.
- [ ] Run the focused Vitest set from Tasks 1–4 and require no unhandled rejection or duplicate dispatch.
- [ ] Run `npm run typecheck` from `apps/desktop`.
- [ ] Run `npm run lint -- --no-warn-ignored` from `apps/desktop` only if supported; otherwise lint the touched files with `npx eslint <exact paths>` and report existing warnings separately.
- [ ] Run `npm run build` from `apps/desktop`; verify both Electron and PWA assets build.
- [ ] Smoke-test on a paired mobile browser with `chat` grant: queued text, cancel queued item, send-now where supported, upload an image just under/at 20 MB, reject one over 20 MB, unsupported runtime message, reload/reconnect without duplicate, and host restart showing interrupted without auto-replay.
- [ ] Inspect `git diff --check` and `git status --short`; preserve unrelated user edits and do not commit.
