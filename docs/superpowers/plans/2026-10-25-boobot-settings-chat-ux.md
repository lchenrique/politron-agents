# Boobot Settings and Chat UX Implementation Plan

> **For agentic workers:** Use Claude Code CLI as explicitly requested by Carlos. Keep all work local; do not commit.

**Goal:** Extend the approved Grafite + Íris visual system across settings, agent editing, shared popovers and chat, while improving the current coding-assistant workflow without inventing future integrations.

**Architecture:** Keep the existing React/Tailwind/Radix primitives, renderer feature boundaries, IPC contracts and data model. Improve shared surfaces at their source, reorganize settings and agent editing without changing their save/load semantics, and make only chat improvements supported by current APIs.

**Tech Stack:** Electron, React, TypeScript, Tailwind CSS, Radix UI, Vitest, Testing Library.

## Global Constraints

- Preserve all pre-existing local modifications; never revert unrelated work.
- Preserve Electron/IPC, settings persistence, workspace/session/agent data, approvals, permissions, model selection and current chat behavior.
- Use the existing `boobot` theme tokens in Light and Dark; do not introduce another palette.
- Do not implement email, marketing or other future plugin functionality in this pass.
- Do not commit or push. No new dependencies.
- Do not claim a chat feature is complete unless its current contract and tests support it.

---

### Task 1: Shared menu and popover spacing

**Files:**
- Modify: `apps/desktop/src/renderer/src/components/ui/dropdown-menu.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/popover.tsx`
- Modify: `apps/desktop/src/renderer/src/components/ui/select.tsx`
- Test: `apps/desktop/src/renderer/src/components/ui/menu-surfaces.test.tsx`

**Acceptance:** Dropdown items, check/radio items, nested menus, selects and popovers have visible, consistent inset from their borders in both themes. Fix malformed utility strings rather than adding caller-specific patches. Preserve Radix behavior, focus states, keyboard navigation and caller class overrides.

- [ ] Add tests that render each primitive in its open state and assert the shared content/item spacing classes and accessible option/menu behavior.
- [ ] Run the new test and confirm it fails for the current missing/malformed spacing.
- [ ] Correct shared primitive classes with a consistent minimum outer inset and item inset.
- [ ] Re-run primitive tests and existing composer/settings menu tests.

### Task 2: Settings dialog hierarchy

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/app/SettingsPage.tsx`
- Test: `apps/desktop/src/renderer/src/features/app/SettingsPage.test.tsx`
- Reuse: `components/ui/field.tsx`, `components/ui/dialog.tsx`, existing theme tokens.

**Acceptance:** All eight existing sections—Geral, Assistente, Ferramentas, Provedores, Skills, Voz em tempo real, Conexões and Atualizações—receive a consistent, easier-to-scan page hierarchy. Keep the section navigation, each existing control and explanation, lazy loading, API calls, validation, feedback, security warnings and modal behavior unchanged. On narrow windows, the content remains reachable and scrollable.

- [ ] Add/adjust tests for section navigation, headings, and lazy loading before restructuring.
- [ ] Give each section a clear title and concise purpose, group related controls into readable cards, and align status/feedback with the controls they describe.
- [ ] Add responsive layout and scroll behavior without changing settings data or IPC calls.
- [ ] Re-run all SettingsPage tests, including provider, skill and update flows.

### Task 3: Agent editor drawer organization

**Files:**
- Modify: `apps/desktop/src/renderer/src/features/editors/Editor.tsx`
- Test: `apps/desktop/src/renderer/src/features/editors/Editor.test.tsx`
- Reuse: existing `PoliCustomizer`, model selector, form and theme primitives.

**Acceptance:** Only the agent editor drawer is visually reworked; conversation and workspace editors retain their existing layout and behavior. Identity, appearance, model/runtime and permissions remain editable, with clear grouping, responsive section navigation, a persistent save/cancel area, and warnings adjacent to consequential permission choices. Save payloads and validation remain unchanged.

- [ ] Add/adjust UI tests for the three agent sections, persistent actions and permission/model fields.
- [ ] Reorganize the drawer around a stable header, selected-section content and sticky footer; keep the avatar preview useful without starving form width.
- [ ] Verify create/edit, role, appearance, model effort and permission values still reach `onSave` exactly as before.
- [ ] Re-run all Editor tests, including conversation and workspace regression cases.

### Task 4: Chat audit and actionable polish

**Files:**
- Inspect the full renderer chat path, especially `features/chat/MessageItem.tsx`, `MessageList.tsx`, `ChatHeader.tsx`, `RunProgress.tsx`, approvals/file-change cards, and `features/composer/Composer.tsx`.
- Modify only the specific chat UI files needed for the selected improvement.
- Test: the corresponding existing chat/component tests; add a focused test where necessary.

**Acceptance:** Return a short, evidence-based prioritized list of remaining chat gaps, distinguishing current behavior from future product ideas. Implement useful, low-risk improvements that fit existing APIs now. At minimum, add an accessible copy action for message content with visible success/failure feedback; do not implement regenerate/edit/resume actions unless the existing app contract safely supports them. Keep every applied file change accessible in the conversation: show the latest completed run in the existing composer review and older runs inline beneath the message identified by `FileChange.messageId`, without duplicating the latest run. Keep attachments, mentions, model/effort, plan mode, voice, stop/steer, history search/pagination, streaming, approvals and delegation intact. Future marketing/email integrations are out of scope.

- [ ] Add a failing test for copying a message and communicating clipboard failure.
- [ ] Add the accessible message action and bounded feedback using the existing notification path; do not log message contents.
- [ ] Add regression tests proving historical applied changes render under their exact message, while the run already shown in the composer is excluded from the timeline.
- [ ] Group historical diffs by `messageId`, pass the latest reviewed run ID from `AppShell` into `MessageList`, and reuse `CompletedFileReview` for read-only visual consistency.
- [ ] Re-run MessageItem/MessageList/Composer/ChatHeader and approval/diff tests.
- [ ] Report three highest-priority remaining chat gaps, evidence/impact, and whether each is implemented now or intentionally deferred.

### Task 5: Full verification and visual review

**Files:** No additional source files unless a failure exposes an in-scope defect.

- [ ] Run `npm test` from `apps/desktop`.
- [ ] Run `npm run typecheck` from `apps/desktop`.
- [ ] Run `npm run lint` from `apps/desktop`.
- [ ] Run `npm run build` from `apps/desktop` after tests/typecheck/lint.
- [ ] Inspect the real desktop settings sections and agent editor in Light and Dark; open representative dropdown/popover surfaces and inspect the chat composer/message actions.
- [ ] Check `git diff --check` and `git status`; preserve all unrelated existing modifications and leave the branch uncommitted.
