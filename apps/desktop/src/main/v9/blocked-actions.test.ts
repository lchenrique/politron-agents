// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { DEFAULT_BLOCKED_ACTIONS } from '../../shared/blocked-actions'
import { blockedActionReason, claudeToolAction, codexApprovalAction, normalizeBlockedActions } from './blocked-actions'
import { ClaudeRuntime } from './claude'
import { ASSISTANT, WorkspaceStore } from './store'
import type { ClaudeInternals } from './test-support'

const root = resolve(tmpdir(), 'boobot-projeto')
const blocked = (command: string, branch?: string | null) => blockedActionReason({ command }, root, DEFAULT_BLOCKED_ACTIONS, branch)
const directories: string[] = []
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

describe('lista do que nunca fazer', () => {
  it('recusa push forçado para main/master e deixa o resto passar', () => {
    for (const command of ['git push --force origin main', 'git push -f origin master', 'git push origin +main', 'git push --force-with-lease origin HEAD:main', 'cd app && git push -uf origin main'])
      expect(blocked(command), command).toMatch(/push forçado/)
    expect(blocked('git push -f', 'main')).toMatch(/push forçado/)
    expect(blocked('git push -f origin HEAD', 'master')).toMatch(/push forçado/)
    for (const command of ['git push origin main', 'git push --force origin feature/x', 'git push -f', 'git push --follow-tags origin main'])
      expect(blocked(command, 'feature/x'), command).toBeNull()
  })

  it('recusa apagar fora da pasta do workspace, inclusive a própria pasta', () => {
    for (const command of ['rm -rf /', 'rm -rf ..', 'rm -rf ../outro', 'sudo rm -r ~/docs', `Remove-Item -Recurse -Force ${homedir()}`, 'rm -rf $HOME/x', 'del /s /q %USERPROFILE%\\x', 'rm -rf .', 'cd .. && rm -rf projeto', 'bash -lc rm -rf /tmp/x'])
      expect(blocked(command), command).toMatch(/apagar fora da pasta/)
    for (const command of ['rm -rf node_modules dist', 'rm file.txt', 'Remove-Item -Recurse -Force build', 'rd /s /q out', 'git rm --cached a.txt', 'npm test'])
      expect(blocked(command), command).toBeNull()
  })

  it('recusa escrever em .env de produção, por comando ou por ferramenta de escrita', () => {
    for (const command of ['echo KEY=1 > .env.production', 'echo x >> config/.env.prod', 'cp .env.example .env.production', "sed -i 's/a/b/' .env.production", 'Set-Content .env.production "x"'])
      expect(blocked(command), command).toMatch(/escrever em/)
    expect(blocked('cat .env.production')).toBeNull()
    expect(blocked('echo x > .env.local')).toBeNull()
    expect(blockedActionReason({ paths: ['apps/api/.env.production'] }, root)).toMatch(/\.env\.production/)
    expect(blockedActionReason({ paths: ['.env.development'] }, root)).toBeNull()
  })

  it('aplica padrões extras e respeita regras desligadas', () => {
    const rules = normalizeBlockedActions({ forcePushMain: false, patterns: ['npm\\s+publish', ''] })
    expect(rules).toEqual({ forcePushMain: false, deleteOutsideWorkspace: true, productionEnvWrite: true, patterns: ['npm\\s+publish'] })
    expect(blockedActionReason({ command: 'NPM publish --access public' }, root, rules)).toMatch(/padrão npm/)
    expect(blockedActionReason({ command: 'git push --force origin main' }, root, rules)).toBeNull()
    expect(() => normalizeBlockedActions({ patterns: ['(['] })).toThrow(/inválido/)
    expect(() => normalizeBlockedActions({ patterns: Array.from({ length: 21 }, (_, index) => `p${index}`) })).toThrow(/20/)
  })

  it('a mensagem diz ao agente que não haverá aprovação', () => {
    expect(blocked('rm -rf /')).toMatch(/mesmo em Acesso total e não será aprovada/)
  })

  it('extrai a ação das ferramentas nativas do Claude e dos pedidos do Codex', () => {
    expect(claudeToolAction('Bash', { command: 'rm -rf /' })).toEqual({ command: 'rm -rf /' })
    expect(claudeToolAction('Write', { file_path: 'C:\\app\\.env.production', content: 'x' })).toEqual({ paths: ['C:\\app\\.env.production'] })
    expect(claudeToolAction('Read', { file_path: 'a.txt' })).toEqual({ paths: ['a.txt'] })
    expect(codexApprovalAction({ command: ['bash', '-lc', 'git push -f origin main'], cwd: '/x' })).toEqual({ command: 'bash -lc git push -f origin main', cwd: '/x' })
    expect(codexApprovalAction({ fileChanges: { '.env.production': {} } })).toEqual({ paths: ['.env.production'] })
  })

  it('persiste a configuração no banco com padrões seguros', () => {
    const directory = mkdtempSync(join(tmpdir(), 'boobot-blocked-')); directories.push(directory)
    const store = new WorkspaceStore(directory)
    try {
      expect(store.blockedActions()).toEqual(DEFAULT_BLOCKED_ACTIONS)
      store.saveBlockedActions({ ...DEFAULT_BLOCKED_ACTIONS, productionEnvWrite: false, patterns: ['terraform\\s+destroy'] })
      expect(store.blockedActions()).toEqual({ ...DEFAULT_BLOCKED_ACTIONS, productionEnvWrite: false, patterns: ['terraform\\s+destroy'] })
    } finally { store.close() }
  })

  it('Claude: o hook PreToolUse nega a ação bloqueada mesmo em bypassPermissions', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'boobot-claude-hook-')); directories.push(directory)
    let options: Record<string, unknown> = {}
    const querySdk = vi.fn((input: { options: Record<string, unknown> }) => {
      options = input.options
      return (async function* () { yield { type: 'system', subtype: 'init', session_id: 's' } as SDKMessage; yield { type: 'result', subtype: 'success', is_error: false } as SDKMessage })() as unknown as Query
    })
    const runtime = new ClaudeRuntime(directory, async () => null, querySdk as unknown as NonNullable<ConstructorParameters<typeof ClaudeRuntime>[2]>)
    ;(runtime as unknown as ClaudeInternals).executable = 'claude'
    runtime.blockedAction = (action, cwd) => blockedActionReason(action, cwd)
    try {
      const threadId = (await runtime.thread({ ...ASSISTANT, runtimePermissionMode: 'bypass' }, directory, [])).id
      await runtime.request('turn/start', { threadId, input: [{ text: 'Teste' }] })
      expect(options.permissionMode).toBe('bypassPermissions')
      const hook = (options.hooks as { PreToolUse: Array<{ hooks: Array<(input: unknown) => Promise<Record<string, unknown>>> }> }).PreToolUse[0].hooks[0]
      const denied = await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'rm -rf /' } })
      expect(denied).toMatchObject({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } })
      expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } })).toEqual({})
    } finally { runtime.close() }
  })
})
