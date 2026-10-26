# Release Links and Agent Terminal Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deliver the verified Windows installer after the chat-link/browser and agent-terminal plans pass, then commit all user-authorized checkout changes and push `master`.

**Architecture:** Run the existing validation/build pipeline from the desktop package, generate the NSIS x64 installer, verify the artifact, review every current and new working-tree change, then create one final commit and push the existing branch. Never publish a broken/missing installer.

**Tech Stack:** npm scripts in `apps/desktop/package.json`, electron-builder NSIS x64, Git.

## Global Constraints

- Existing script: `npm run dist:win` runs `npm run build && electron-builder --win nsis --x64 --publish never`.
- Installer output directory: `apps/desktop/dist`; artifact pattern: `Boobot-Setup-${version}-${arch}.exe`.
- User explicitly authorized including all pre-existing checkout changes and pushing `master` to `origin/master`.
- Preserve all working-tree changes. Do not reset, clean, stash, or discard files.
- Do not push if the installer build fails; report the real state and error.

---

## Task 1: Run release checks after both subsystem plans

**Dependency:** Both `2026-10-26-chat-links-platform-browser.md` and `2026-10-26-agent-terminal-sessions.md` must be complete.

- [ ] From `apps/desktop`, run `npm run typecheck` and record its actual result.
- [ ] Run focused tests for message link routing, platform browser, agent terminal lifecycle, host RPC, and PWA policy.
- [ ] Run `npm test` and `npm run lint`; record intermittent or existing failures without claiming they passed.
- [ ] Run `npm run dist:win`; because this script also runs `npm run build`, do not duplicate the full build unnecessarily.
- [ ] Verify `apps/desktop/dist/Boobot-Setup-<version>-x64.exe` exists, is non-empty, and report the observed exact filename and byte size. If the build fails or artifact is absent, stop before push.

## Task 2: Review all changes and commit once

**Files:**
- Review: all tracked and untracked changes returned by `git status --short`.
- Include: user pre-existing changes, approved design spec, subsystem plans, and implementation.

- [ ] Inspect `git diff --stat`, `git diff --check`, `git diff`, and `git diff --cached`; review untracked files individually.
- [ ] Check that no secret, credential, generated build directory, or unrelated temporary artifact is staged. Do not delete or overwrite user files; if a secret is discovered, stop and report it.
- [ ] Run `git add -A`, inspect `git diff --cached --stat` and the staged diff, then create one final commit with a message describing the combined deliverable.
- [ ] Confirm `git status --short` has no remaining intended changes and record the commit hash. Do not amend or rewrite existing history.

## Task 3: Push and deliver

- [ ] Run `git push origin master` only after Task 1 produced and checked the installer and Task 2 created the final commit.
- [ ] Verify the push command exit status and the resulting upstream commit; do not claim success if either is unknown or failed.
- [ ] Run `bright-memory save` per `AGENTS.md` after completing the project work.
- [ ] Deliver the verified `.exe` as a file attachment and state its absolute path, commit hash, push result, validation results, and any remaining failures.
